import { describe, expect, it } from "vitest"

import {
  buildSupabaseRows,
  deduplicateJobs,
  isRemoteOnlyJob,
  jobFingerprint,
  jobIdentity,
} from "./sync-utils.mjs"

const greenhouseJob = {
  source: "greenhouse",
  sourceJobId: "job-1",
  company: "Acme",
  title: "Software Engineer",
  description: "Build software.",
  url: "https://example.com/jobs/1?utm_source=greenhouse",
  location: "Remote",
  isRemote: true,
  sourceTimestampAt: "2026-09-23T10:00:00.000Z",
  sourceTimestampKind: "published",
}

describe("job sync utilities", () => {
  it("accepts only explicitly remote jobs", () => {
    expect(isRemoteOnlyJob(greenhouseJob)).toBe(true)
    expect(isRemoteOnlyJob({ ...greenhouseJob, isRemote: false })).toBe(
      false,
    )
    expect(
      isRemoteOnlyJob({
        ...greenhouseJob,
        location: "Manila (Hybrid)",
      }),
    ).toBe(false)
    expect(
      isRemoteOnlyJob({
        ...greenhouseJob,
        description: "This is an office-based position.",
      }),
    ).toBe(false)
    expect(
      isRemoteOnlyJob({
        ...greenhouseJob,
        description: "Worksite: OnsiteJob Posting",
      }),
    ).toBe(false)
    expect(
      isRemoteOnlyJob({
        ...greenhouseJob,
        description: "This position is partially remote.",
      }),
    ).toBe(false)
  })

  it("deduplicates source IDs and canonical URLs", () => {
    const jobs = deduplicateJobs([
      {
        ...greenhouseJob,
        source: "jooble",
        sourceJobId: "aggregated-1",
      },
      greenhouseJob,
      { ...greenhouseJob },
    ])

    expect(jobs).toHaveLength(1)
    expect(jobs[0].source).toBe("greenhouse")
    expect(jobs[0].url).toBe("https://example.com/jobs/1")
  })

  it("deduplicates aggregator copies by title, company, and location", () => {
    const jobs = deduplicateJobs([
      {
        ...greenhouseJob,
        source: "nomado24",
        sourceJobId: "aggregated-copy",
        url: "https://nomado24.example/jobs/aggregated-copy",
      },
      greenhouseJob,
    ])

    expect(jobs).toHaveLength(1)
    expect(jobs[0].source).toBe("greenhouse")
    expect(jobFingerprint(jobs[0])).toBe(
      "software engineer|acme|remote",
    )
  })

  it("retains equivalent titles posted in different locations", () => {
    const jobs = deduplicateJobs([
      greenhouseJob,
      {
        ...greenhouseJob,
        sourceJobId: "job-2",
        url: "https://example.com/jobs/2",
        location: "London",
      },
    ])

    expect(jobs).toHaveLength(2)
  })

  it("constructs idempotent rows while preserving user-edited fields", () => {
    const existingByIdentity = new Map([
      [
        jobIdentity(greenhouseJob),
        {
          title: "My saved title",
          description: "My saved notes",
          url: "https://example.com/my-saved-url",
          first_seen_at: "2026-09-20T08:00:00.000Z",
        },
      ],
    ])
    const [row] = buildSupabaseRows([greenhouseJob], "owner-1", {
      existingByIdentity,
      observedAt: "2026-09-24T01:00:00.000Z",
    })

    expect(row).toEqual({
      user_id: "owner-1",
      source: "greenhouse",
      source_job_id: "job-1",
      title: "My saved title",
      description: "My saved notes",
      url: "https://example.com/my-saved-url",
      company: "Acme",
      location: "Remote",
      is_remote: true,
      source_timestamp_at: "2026-09-23T10:00:00.000Z",
      source_timestamp_kind: "published",
      source_timestamp_label: null,
      first_seen_at: "2026-09-20T08:00:00.000Z",
      last_seen_at: "2026-09-24T01:00:00.000Z",
    })
  })

  it("preserves an existing source date when enrichment is unavailable", () => {
    const jobWithoutDate = {
      ...greenhouseJob,
      sourceTimestampAt: null,
      sourceTimestampKind: null,
    }
    const existingByIdentity = new Map([
      [
        jobIdentity(jobWithoutDate),
        {
          source_timestamp_at: "2026-09-23T10:00:00.000Z",
          source_timestamp_kind: "published",
        },
      ],
    ])
    const [row] = buildSupabaseRows([jobWithoutDate], null, {
      existingByIdentity,
    })

    expect(row).toMatchObject({
      source_timestamp_at: "2026-09-23T10:00:00.000Z",
      source_timestamp_kind: "published",
      source_timestamp_label: null,
    })
  })

  it("stores a provider label only when no exact timestamp exists", () => {
    const [row] = buildSupabaseRows([
      {
        ...greenhouseJob,
        source: "linkedin-email",
        sourceTimestampAt: null,
        sourceTimestampKind: null,
        sourceTimestampLabel: "3 days ago",
      },
    ], null)

    expect(row).toMatchObject({
      source_timestamp_at: null,
      source_timestamp_kind: null,
      source_timestamp_label: "3 days ago",
    })
  })
})
