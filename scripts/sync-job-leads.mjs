import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"

import {
  loadLocalEnvironment,
  loadSourceConfig,
} from "./job-sources/config.mjs"
import { fetchConfiguredSourceResults } from "./job-sources/index.mjs"
import { backfillLinkedInTimestamps } from "./job-sources/linkedin-timestamp-backfill.mjs"
import { matchesTargetRole } from "./job-sources/role-filter.mjs"
import { fetchSupabaseJson } from "./job-sources/supabase-fetch.mjs"
import {
  startSyncRun,
  finishSyncRun,
  sanitizeHistoryError,
} from "./job-sources/sync-history.mjs"
import {
  buildSupabaseRows,
  chunk,
  deduplicateJobs,
  isRemoteOnlyJob,
  jobIdentity,
} from "./job-sources/sync-utils.mjs"

function matchesSyncCriteria(job) {
  return matchesTargetRole(job) && isRemoteOnlyJob(job)
}

export function summarizeLinkedInTimestampBackfill(backfill) {
  const databaseFailureCount = backfill.failures.filter(
    (failure) => failure.kind === "database",
  ).length
  const providerFailures = backfill.failures.filter(
    (failure) => failure.kind !== "database",
  )
  const providerFailureCount = providerFailures.length
  const providerFailureReasons = new Map()

  for (const failure of providerFailures) {
    const reason = /^HTTP \d{3}$/.test(failure.error)
      ? failure.error
      : /timeout|timed out/i.test(failure.error)
        ? "timeout"
        : /fetch failed|network/i.test(failure.error)
          ? "network error"
          : "other error"
    providerFailureReasons.set(
      reason,
      (providerFailureReasons.get(reason) ?? 0) + 1,
    )
  }

  const providerFailureDetail = [...providerFailureReasons]
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ")
  const skippedLabelCount = backfill.labelsSkipped ?? 0
  const errors = [
    providerFailureCount > 0 &&
      `${providerFailureCount} LinkedIn page request(s) failed (${providerFailureDetail})`,
    databaseFailureCount > 0 &&
      `${databaseFailureCount} database update(s) failed during LinkedIn date backfill`,
    skippedLabelCount > 0 &&
      `${skippedLabelCount} relative date label(s) skipped because ` +
        "source_timestamp_label is not deployed",
  ].filter(Boolean)

  return {
    source: "linkedin-email",
    name: "linkedin-email:timestamp-backfill",
    status:
      skippedLabelCount > 0 || databaseFailureCount > 0
        ? "failed"
        : providerFailureCount > 0
          ? "warning"
          : "ok",
    fetched: backfill.attempted,
    matching: backfill.updated,
    new_jobs: null,
    existing_jobs: null,
    error: errors.length > 0 ? errors.join("; ") : null,
  }
}

export async function loadExistingLeads(client, userId, jobs) {
  const existingByIdentity = new Map()
  const jobsBySource = new Map()

  for (const job of jobs) {
    const sourceJobs = jobsBySource.get(job.source) ?? []
    sourceJobs.push(job)
    jobsBySource.set(job.source, sourceJobs)
  }

  for (const [source, sourceJobs] of jobsBySource) {
    for (const jobBatch of chunk(sourceJobs, 100)) {
      let query = client
        .from("job_leads")
        .select("*")
        .in(
          "source_job_id",
          jobBatch.map((job) => job.sourceJobId),
        )

      query = ["onlinejobsph", "onlinejobsph-email"].includes(source)
        ? query.in("source", ["onlinejobsph", "onlinejobsph-email"])
        : query.eq("source", source)

      query = userId ? query.eq("user_id", userId) : query.is("user_id", null)

      const { data, error } = await query

      if (error) {
        throw new Error(
          `Could not read existing ${source} leads: ${error.message}`,
        )
      }

      for (const lead of data ?? []) {
        existingByIdentity.set(`${lead.source}:${lead.source_job_id}`, lead)
        const requestedIdentity = `${source}:${lead.source_job_id}`
        if (!existingByIdentity.has(requestedIdentity) || lead.source === source) {
          existingByIdentity.set(requestedIdentity, lead)
        }
      }
    }
  }

  return existingByIdentity
}

async function upsertLeads(client, rows, onWritten = () => {}) {
  for (const rowBatch of chunk(rows, 100)) {
    let { error } = await client.from("job_leads").upsert(rowBatch, {
      onConflict: "user_id,source,source_job_id",
    })

    if (error && /source_timestamp_label/i.test(error.message)) {
      const legacyRows = rowBatch.map(
        ({ source_timestamp_label: _sourceTimestampLabel, ...row }) => row,
      )
      const legacyResult = await client
        .from("job_leads")
        .upsert(legacyRows, { onConflict: "user_id,source,source_job_id" })
      error = legacyResult.error
    }

    if (error) {
      throw new Error(`Could not upsert job leads: ${error.message}`)
    }
    onWritten(rowBatch)
  }
}

function resolveSupabaseEnvironment(environment) {
  const configuredOwnerId = environment.JOB_LEADS_OWNER_ID?.trim()

  return {
    url: environment.SUPABASE_URL || environment.VITE_SUPABASE_URL,
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    ownerId:
      configuredOwnerId &&
      configuredOwnerId !== "00000000-0000-0000-0000-000000000000"
        ? configuredOwnerId
        : null,
  }
}

export async function runJobSync({
  config,
  environment = process.env,
  fetchImpl = fetch,
  forceDryRun = false,
  clientFactory = createClient,
  trigger = "local_sync",
  sourceFetcher = fetchConfiguredSourceResults,
  timestampBackfill = backfillLinkedInTimestamps,
} = {}) {
  const supabaseEnvironment = resolveSupabaseEnvironment(environment)
  const missingSupabaseValues = [
    !supabaseEnvironment.url && "SUPABASE_URL",
    !supabaseEnvironment.serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean)
  const dryRun = forceDryRun || missingSupabaseValues.length > 0
  const client = dryRun
    ? null
    : clientFactory(
        supabaseEnvironment.url,
        supabaseEnvironment.serviceRoleKey,
        {
          auth: { autoRefreshToken: false, persistSession: false },
          global: { fetch: fetchSupabaseJson },
        },
      )
  let syncRunId = null
  let historyWarning = null
  const history = {
    fetched: 0,
    matching: 0,
    unique_jobs: 0,
    written: 0,
    existing_jobs: 0,
    sources: [],
  }
  function warnHistory(error) {
    historyWarning =
      "Sync history could not be saved; job ingestion was not disabled."
    console.warn(historyWarning, sanitizeHistoryError(error, environment))
  }
  if (client) {
    try {
      syncRunId = await startSyncRun(
        client,
        supabaseEnvironment.ownerId,
        trigger,
      )
    } catch (error) {
      warnHistory(error)
    }
  }
  try {
    const sourceConfig = config ?? (await loadSourceConfig())
    const sourceResults = await sourceFetcher(sourceConfig, {
      environment,
      fetchImpl,
      client,
      userId: supabaseEnvironment.ownerId,
    })
    const fetchedJobs = sourceResults
      .filter((result) => result.status === "ok")
      .flatMap((result) => result.jobs)
    const matchingBySource = sourceResults.map((result) =>
      result.status === "ok" ? result.jobs.filter(matchesSyncCriteria) : [],
    )
    const matchedJobs = matchingBySource.flat()
    // Carry the adapter's identity through deduplication, then remove this
    // internal marker before returning jobs or building database rows.
    const selectedJobs = deduplicateJobs(matchingBySource.flatMap(
      (sourceJobs, sourceResultIndex) => sourceJobs.map((job) => ({
        ...job,
        sourceResultIndex,
      })),
    ))
    const summaryIndexByIdentity = new Map(selectedJobs.map((job) => [
      jobIdentity(job), job.sourceResultIndex,
    ]))
    const jobs = selectedJobs.map(({ sourceResultIndex: _sourceResultIndex, ...job }) => job)

    const sourceSummaries = sourceResults.map((result, index) => ({
      name: result.name,
      status: result.status,
      fetched: result.jobs.length,
      matching: matchingBySource[index].length,
      new_jobs: null,
      existing_jobs: null,
      error: result.error,
    }))
    Object.assign(history, {
      fetched: fetchedJobs.length,
      matching: matchedJobs.length,
      unique_jobs: jobs.length,
      sources: sourceSummaries,
    })

    if (dryRun) {
      return {
        dryRun: true,
        sourceSummaries,
        fetched: fetchedJobs.length,
        matching: matchedJobs.length,
        unique: jobs.length,
        written: 0,
        missingSupabaseValues,
        jobs,
      }
    }

    const existingByIdentity = await loadExistingLeads(
      client,
      supabaseEnvironment.ownerId,
      jobs,
    )
    const rows = buildSupabaseRows(jobs, supabaseEnvironment.ownerId, {
      existingByIdentity,
    })
    for (const job of jobs) {
      const existing = existingByIdentity.get(jobIdentity(job))
      if (existing) summaryIndexByIdentity.set(`${existing.source}:${existing.source_job_id}`, summaryIndexByIdentity.get(jobIdentity(job)))
    }

    for (const summary of sourceSummaries) {
      summary.new_jobs = 0
      summary.existing_jobs = 0
    }
    await upsertLeads(client, rows, (batch) => {
      for (const row of batch) {
        const identity = `${row.source}:${row.source_job_id}`
        const wasExisting = existingByIdentity.has(identity)
        const summary = sourceSummaries[summaryIndexByIdentity.get(identity)]
        history.written += 1
        history.existing_jobs += wasExisting ? 1 : 0
        summary[wasExisting ? "existing_jobs" : "new_jobs"] += 1
      }
    })

    const linkedinTimestampBackfill = await timestampBackfill(client, {
      fetchImpl,
      limit: environment.JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT,
    })
    sourceSummaries.push(
      summarizeLinkedInTimestampBackfill(linkedinTimestampBackfill),
    )
    const status = sourceSummaries.some((source) => source.status === "failed")
      ? "failed"
      : sourceSummaries.some((source) => source.status === "warning")
        ? "warning"
        : "success"
    if (syncRunId) {
      try {
        await finishSyncRun(
          client,
          syncRunId,
          { ...history, status },
          environment,
        )
      } catch (error) {
        warnHistory(error)
      }
    }

    return {
      dryRun: false,
      syncRunId,
      historyWarning,
      trigger,
      sourceSummaries,
      fetched: fetchedJobs.length,
      matching: matchedJobs.length,
      unique: jobs.length,
      written: rows.length,
      existing: jobs.filter((job) => existingByIdentity.has(jobIdentity(job)))
        .length,
      linkedinTimestampBackfill,
      missingSupabaseValues: [],
      jobs: [],
    }
  } catch (error) {
    if (syncRunId) {
      try {
        await finishSyncRun(
          client,
          syncRunId,
          {
            ...history,
            status: "failed",
            error_message:
              error instanceof Error ? error.message : String(error),
          },
          environment,
        )
      } catch (historyError) {
        warnHistory(historyError)
      }
    }
    throw error
  }
}

export function printSyncSummary(summary) {
  for (const source of summary.sourceSummaries) {
    if (source.status === "ok") {
      console.log(
        `${source.name}: OK fetched=${source.fetched} matching=${source.matching} ` +
          `new=${source.new_jobs ?? "not-recorded"} existing=${source.existing_jobs ?? "not-recorded"}`,
      )
    } else {
      console.log(
        `${source.name}: ${source.status.toUpperCase()} (${source.error})`,
      )
    }
  }

  console.log(
    `Sync: mode=${summary.dryRun ? "DRY_RUN" : "LIVE"} ` +
      `fetched=${summary.fetched} matching=${summary.matching} ` +
      `unique=${summary.unique} written=${summary.written}`,
  )

  if (summary.missingSupabaseValues.length > 0) {
    console.log(
      `Supabase write skipped; missing ${summary.missingSupabaseValues.join(
        ", ",
      )}.`,
    )
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  loadLocalEnvironment()

  try {
    const summary = await runJobSync({
      forceDryRun: process.argv.includes("--dry-run"),
    })
    printSyncSummary(summary)

    if (summary.sourceSummaries.some((source) => source.status === "failed")) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
