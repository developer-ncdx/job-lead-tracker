import { describe, expect, it, vi } from "vitest"
import { runJobSync } from "../sync-job-leads.mjs"
import { sanitizeHistoryError } from "./sync-history.mjs"

const job = {
  source: "greenhouse",
  sourceJobId: "new",
  title: "Software Engineer",
  description: "Remote software work",
  company: "Acme",
  location: "Remote",
  isRemote: true,
  url: "https://example.com/jobs/new",
}
const environment = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "private-key",
}
const backfill = { attempted: 0, updated: 0, labelsSkipped: 0, failures: [] }
const source = (jobs = [job]) => ({
  source: "greenhouse",
  name: "greenhouse:acme",
  status: "ok",
  jobs,
  error: null,
})

function mockSyncClient({
  missingTable = false,
  failFinish = false,
  failBatch = 0,
  failRead = false,
  firstWriteError = null,
  existing = [],
} = {}) {
  const runs = []
  const updates = []
  const writes = []
  const client = {
    from: vi.fn((table) => {
      if (table === "job_sync_runs") {
        const builder = {
          select: () => builder,
          abortSignal: () => builder,
          single: async () => ({
            data: missingTable ? null : { id: "run-1" },
            error: missingTable ? { message: "Missing table" } : null,
          }),
        }
        return {
          insert: (values) => {
            runs.push(values)
            return builder
          },
          update: (values) => ({
            eq: () => {
              updates.push(values)
              builder.single = async () => ({
                data: failFinish ? null : { id: "run-1" },
                error: failFinish ? { message: "History unavailable" } : null,
              })
              return builder
            },
          }),
        }
      }
      const query = {
        eq: () => query,
        in: () => query,
        is: () => query,
        then: (resolve) =>
          Promise.resolve({
            data: existing,
            error: failRead ? { message: "Database read unavailable" } : null,
          }).then(resolve),
      }
      return {
        select: () => query,
        upsert: async (rows) => {
          writes.push(rows)
          return {
            error:
              writes.length === 1 && firstWriteError
                ? { message: firstWriteError }
                : writes.length === failBatch
                ? { message: "Database unavailable" }
                : null,
          }
        },
      }
    }),
  }
  return { client, runs, updates, writes }
}

const syncOptions = (mock, extra = {}) => ({
  config: {},
  environment,
  clientFactory: () => mock.client,
  sourceFetcher: async () => [source()],
  timestampBackfill: async () => backfill,
  ...extra,
})

describe("sync run recording", () => {
  it("stores the execution method, outcome and synced counts", async () => {
    const mock = mockSyncClient()
    const result = await runJobSync(
      syncOptions(mock, { trigger: "scheduled_cron" }),
    )
    expect(mock.runs).toEqual([{ user_id: null, trigger: "scheduled_cron" }])
    expect(mock.updates[0]).toMatchObject({
      status: "success",
      fetched: 1,
      matching: 1,
      unique_jobs: 1,
      written: 1,
      existing_jobs: 0,
    })
    expect(mock.updates[0].finished_at).toBeTruthy()
    expect(result).toMatchObject({
      syncRunId: "run-1",
      historyWarning: null,
      trigger: "scheduled_cron",
    })
    expect(result.sourceSummaries[0]).toMatchObject({ new_jobs: 1, existing_jobs: 0 })
  })
  it("defaults local CLI syncs to a local trigger and respects owner scope", async () => {
    const mock = mockSyncClient()
    await runJobSync(
      syncOptions(mock, {
        environment: { ...environment, JOB_LEADS_OWNER_ID: "owner-1" },
      }),
    )
    expect(mock.runs[0]).toEqual({ user_id: "owner-1", trigger: "local_sync" })
  })
  it("keeps job ingestion working when the history migration has not been applied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const mock = mockSyncClient({ missingTable: true })
      const result = await runJobSync(syncOptions(mock))
      expect(result).toMatchObject({
        written: 1,
        syncRunId: null,
        historyWarning: expect.stringContaining("not disabled"),
      })
      expect(mock.writes).toHaveLength(1)
      expect(mock.updates).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })
  it("does not turn a successfully imported run into a failure when telemetry cannot finish", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const mock = mockSyncClient({ failFinish: true })
      const result = await runJobSync(syncOptions(mock))
      expect(result.written).toBe(1)
      expect(result.historyWarning).toBeTruthy()
    } finally {
      warn.mockRestore()
    }
  })
  it("records failed sources even when healthy sources wrote rows", async () => {
    const mock = mockSyncClient()
    await runJobSync(
      syncOptions(mock, {
        sourceFetcher: async () => [
          source(),
          {
            name: "email-alerts",
            status: "failed",
            jobs: [],
            error: "IMAP unavailable",
          },
        ],
      }),
    )
    expect(mock.updates[0]).toMatchObject({
      status: "failed",
      written: 1,
      sources: expect.arrayContaining([
        expect.objectContaining({ status: "failed" }),
      ]),
    })
  })
  it("keeps optional date backfill failures as warnings", async () => {
    const mock = mockSyncClient()
    await runJobSync(
      syncOptions(mock, {
        timestampBackfill: async () => ({
          ...backfill,
          attempted: 1,
          failures: [{ kind: "provider", error: "HTTP 429" }],
        }),
      }),
    )
    expect(mock.updates[0]).toMatchObject({ status: "warning", written: 1 })
  })
  it("records partial writes when a later batch fails and still throws the actual error", async () => {
    const mock = mockSyncClient({ failBatch: 2 })
    const jobs = Array.from({ length: 101 }, (_, i) => ({
      ...job,
      sourceJobId: `${i}`,
      title: `Software Engineer ${i}`,
      url: `https://example.com/jobs/${i}`,
    }))
    await expect(
      runJobSync(
        syncOptions(mock, { sourceFetcher: async () => [source(jobs)] }),
      ),
    ).rejects.toThrow("Database unavailable")
    expect(mock.updates[0]).toMatchObject({
      status: "failed",
      written: 100,
      error_message: "Could not upsert job leads: Database unavailable",
    })
    expect(mock.updates[0].sources[0]).toMatchObject({
      matching: 101, new_jobs: 100, existing_jobs: 0,
    })
  })
  it("records unexpected source exceptions and redacts credentials from stored errors", async () => {
    const mock = mockSyncClient()
    await expect(
      runJobSync(
        syncOptions(mock, {
          sourceFetcher: async () => {
            throw new Error("Rejected private-key")
          },
        }),
      ),
    ).rejects.toThrow("Rejected private-key")
    expect(mock.updates[0]).toMatchObject({
      status: "failed",
      written: 0,
      error_message: "Rejected [redacted]",
    })
  })
  it("creates no history or database writes for a dry run", async () => {
    const clientFactory = vi.fn()
    const result = await runJobSync({
      config: {},
      environment,
      clientFactory,
      forceDryRun: true,
      sourceFetcher: async () => [source()],
    })
    expect(result.dryRun).toBe(true)
    expect(clientFactory).not.toHaveBeenCalled()
    expect(result.sourceSummaries[0]).toMatchObject({ new_jobs: null, existing_jobs: null })
    expect(result.jobs[0]).not.toHaveProperty("sourceResultIndex")
  })
  it("limits stored error messages and masks configured secrets", () => {
    expect(
      sanitizeHistoryError("secret password", {
        API_KEY: "secret",
        APP_PASSWORD: "password",
      }),
    ).toBe("[redacted] [redacted]")
    expect(sanitizeHistoryError("x".repeat(1500))).toHaveLength(1000)
  })

  it("records new and existing writes per adapter, without double-counting shared jobs", async () => {
    const oldJob = { ...job, sourceJobId: "old", url: "https://example.com/jobs/old" }
    const newJob = { ...job, sourceJobId: "new", title: "Software Engineer 2" }
    const mock = mockSyncClient({ existing: [{
      source: "greenhouse", source_job_id: "old", title: oldJob.title,
    }] })
    const result = await runJobSync(syncOptions(mock, {
      sourceFetcher: async () => [
        source([oldJob, oldJob]),
        { ...source([oldJob, newJob]), name: "greenhouse:second-board" },
      ],
    }))
    expect(result.sourceSummaries[0]).toMatchObject({
      matching: 2, new_jobs: 0, existing_jobs: 1,
    })
    expect(result.sourceSummaries[1]).toMatchObject({
      matching: 2, new_jobs: 1, existing_jobs: 0,
    })
    expect(mock.updates[0]).toMatchObject({ written: 2, existing_jobs: 1 })
    expect(mock.updates[0].sources.slice(0, 2)).toEqual(result.sourceSummaries.slice(0, 2))
    expect(mock.writes[0].every(row => !Object.hasOwn(row, "sourceResultIndex"))).toBe(true)
  })

  it("credits only the adapter selected by source-priority deduplication", async () => {
    const mock = mockSyncClient()
    const result = await runJobSync(syncOptions(mock, {
      sourceFetcher: async () => [
        { ...source([{ ...job, source: "remotive" }]), name: "remotive:global" },
        source(),
      ],
    }))
    expect(result.sourceSummaries[0]).toMatchObject({
      matching: 1, new_jobs: 0, existing_jobs: 0,
    })
    expect(result.sourceSummaries[1]).toMatchObject({
      matching: 1, new_jobs: 1, existing_jobs: 0,
    })
    expect(result.written).toBe(1)
  })

  it("does not report fetched or rejected jobs as new or existing writes", async () => {
    const mock = mockSyncClient()
    const result = await runJobSync(syncOptions(mock, {
      sourceFetcher: async () => [source([
        { ...job, isRemote: false },
        { ...job, title: "Software Engineer - Hybrid" },
        { ...job, title: "Accountant" },
      ])],
    }))
    expect(result.sourceSummaries[0]).toMatchObject({
      fetched: 3, matching: 0, new_jobs: 0, existing_jobs: 0,
    })
    expect(mock.writes).toHaveLength(0)
  })

  it("keeps per-source counts unknown when the database check fails before writing", async () => {
    const mock = mockSyncClient({ failRead: true })
    await expect(runJobSync(syncOptions(mock))).rejects.toThrow("Database read unavailable")
    expect(mock.updates[0].sources[0]).toMatchObject({ new_jobs: null, existing_jobs: null })
    expect(mock.writes).toHaveLength(0)
  })

  it("counts a legacy timestamp-column retry only after its successful write", async () => {
    const mock = mockSyncClient({ firstWriteError: "source_timestamp_label is not in the schema cache" })
    const result = await runJobSync(syncOptions(mock))
    expect(mock.writes).toHaveLength(2)
    expect(result.sourceSummaries[0]).toMatchObject({ new_jobs: 1, existing_jobs: 0 })
    expect(mock.updates[0]).toMatchObject({ written: 1, existing_jobs: 0 })
  })

  it("records zero writes for failed and skipped sources, and excludes date-only enrichment", async () => {
    const mock = mockSyncClient()
    const result = await runJobSync(syncOptions(mock, {
      sourceFetcher: async () => [
        source(),
        { ...source([]), name: "email-alerts:gmail", status: "failed", error: "IMAP unavailable" },
        { ...source([]), name: "jooble:global", status: "skipped", error: "No API key" },
      ],
      timestampBackfill: async () => ({ ...backfill, attempted: 1, updated: 1 }),
    }))
    expect(result.sourceSummaries[1]).toMatchObject({ new_jobs: 0, existing_jobs: 0 })
    expect(result.sourceSummaries[2]).toMatchObject({ new_jobs: 0, existing_jobs: 0 })
    expect(result.sourceSummaries[3]).toMatchObject({ new_jobs: null, existing_jobs: null })
  })
})
