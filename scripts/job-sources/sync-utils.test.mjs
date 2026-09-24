import { describe, expect, it } from "vitest"

import {
  buildSupabaseRows,
  deduplicateJobs,
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
      first_seen_at: "2026-09-20T08:00:00.000Z",
      last_seen_at: "2026-09-24T01:00:00.000Z",
    })
  })
})
