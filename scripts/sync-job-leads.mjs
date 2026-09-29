import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"

import {
  loadLocalEnvironment,
  loadSourceConfig,
} from "./job-sources/config.mjs"
import { fetchConfiguredSourceResults } from "./job-sources/index.mjs"
import { backfillLinkedInTimestamps } from "./job-sources/linkedin-timestamp-backfill.mjs"
import { matchesTargetRole } from "./job-sources/role-filter.mjs"
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

async function loadExistingLeads(client, userId, jobs) {
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
        .eq("source", source)
        .in(
          "source_job_id",
          jobBatch.map((job) => job.sourceJobId),
        )

      query = userId
        ? query.eq("user_id", userId)
        : query.is("user_id", null)

      const { data, error } = await query

      if (error) {
        throw new Error(
          `Could not read existing ${source} leads: ${error.message}`,
        )
      }

      for (const lead of data ?? []) {
        existingByIdentity.set(
          `${lead.source}:${lead.source_job_id}`,
          lead,
        )
      }
    }
  }

  return existingByIdentity
}

async function upsertLeads(client, rows) {
  for (const rowBatch of chunk(rows, 100)) {
    let { error } = await client.from("job_leads").upsert(rowBatch, {
      onConflict: "user_id,source,source_job_id",
    })

    if (error && /source_timestamp_label/i.test(error.message)) {
      const legacyRows = rowBatch.map(
        ({ source_timestamp_label: _sourceTimestampLabel, ...row }) => row,
      )
      const legacyResult = await client.from("job_leads").upsert(
        legacyRows,
        { onConflict: "user_id,source,source_job_id" },
      )
      error = legacyResult.error
    }

    if (error) {
      throw new Error(`Could not upsert job leads: ${error.message}`)
    }
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
} = {}) {
  const sourceConfig = config ?? (await loadSourceConfig())
  const sourceResults = await fetchConfiguredSourceResults(sourceConfig, {
    environment,
    fetchImpl,
  })
  const fetchedJobs = sourceResults
    .filter((result) => result.status === "ok")
    .flatMap((result) => result.jobs)
  const matchedJobs = fetchedJobs.filter(matchesSyncCriteria)
  const jobs = deduplicateJobs(matchedJobs)
  const supabaseEnvironment = resolveSupabaseEnvironment(environment)
  const missingSupabaseValues = [
    !supabaseEnvironment.url && "SUPABASE_URL",
    !supabaseEnvironment.serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean)
  const dryRun = forceDryRun || missingSupabaseValues.length > 0

  const sourceSummaries = sourceResults.map((result) => ({
    name: result.name,
    status: result.status,
    fetched: result.jobs.length,
    matching:
      result.status === "ok"
        ? result.jobs.filter(matchesSyncCriteria).length
        : 0,
    error: result.error,
  }))

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

  const client = clientFactory(
    supabaseEnvironment.url,
    supabaseEnvironment.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
  const existingByIdentity = await loadExistingLeads(
    client,
    supabaseEnvironment.ownerId,
    jobs,
  )
  const rows = buildSupabaseRows(jobs, supabaseEnvironment.ownerId, {
    existingByIdentity,
  })

  await upsertLeads(client, rows)

  const linkedinTimestampBackfill = await backfillLinkedInTimestamps(
    client,
    {
      fetchImpl,
      limit: environment.JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT,
    },
  )
  const backfillFailureCount = linkedinTimestampBackfill.failures.length
  const skippedLabelCount = linkedinTimestampBackfill.labelsSkipped ?? 0
  const backfillHasIssues =
    backfillFailureCount > 0 || skippedLabelCount > 0

  const backfillErrors = [
    backfillFailureCount > 0 &&
      `${backfillFailureCount} LinkedIn page request(s) failed`,
    skippedLabelCount > 0 &&
      `${skippedLabelCount} relative date label(s) skipped because ` +
        "source_timestamp_label is not deployed",
  ].filter(Boolean)

  sourceSummaries.push({
    source: "linkedin-email",
    name: "linkedin-email:timestamp-backfill",
    status: backfillHasIssues ? "failed" : "ok",
    fetched: linkedinTimestampBackfill.attempted,
    matching: linkedinTimestampBackfill.updated,
    error: backfillHasIssues ? backfillErrors.join("; ") : null,
  })

  return {
    dryRun: false,
    sourceSummaries,
    fetched: fetchedJobs.length,
    matching: matchedJobs.length,
    unique: jobs.length,
    written: rows.length,
    existing: jobs.filter((job) =>
      existingByIdentity.has(jobIdentity(job)),
    ).length,
    linkedinTimestampBackfill,
    missingSupabaseValues: [],
    jobs: [],
  }
}

export function printSyncSummary(summary) {
  for (const source of summary.sourceSummaries) {
    if (source.status === "ok") {
      console.log(
        `${source.name}: OK fetched=${source.fetched} matching=${source.matching}`,
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
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  loadLocalEnvironment()

  try {
    const summary = await runJobSync({
      forceDryRun: process.argv.includes("--dry-run"),
    })
    printSyncSummary(summary)

    if (
      summary.sourceSummaries.some((source) => source.status === "failed")
    ) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
