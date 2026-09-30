import { describe, expect, it } from "vitest"

import { summarizeLinkedInTimestampBackfill } from "./sync-job-leads.mjs"

describe("LinkedIn date backfill sync summary", () => {
  it("treats blocked provider pages as a non-fatal warning", () => {
    expect(summarizeLinkedInTimestampBackfill({
      attempted: 6,
      updated: 0,
      labelsSkipped: 0,
      failures: [{ sourceJobId: "123", error: "HTTP 429" }],
    })).toMatchObject({
      status: "warning",
      fetched: 6,
      matching: 0,
      error: "1 LinkedIn page request(s) failed",
    })
  })

  it("keeps a missing database label column fatal", () => {
    expect(summarizeLinkedInTimestampBackfill({
      attempted: 1,
      updated: 0,
      labelsSkipped: 1,
      failures: [],
    })).toMatchObject({
      status: "failed",
      error: expect.stringContaining("source_timestamp_label is not deployed"),
    })
  })

  it("reports successful date enrichment as healthy", () => {
    expect(summarizeLinkedInTimestampBackfill({
      attempted: 1,
      updated: 1,
      labelsSkipped: 0,
      failures: [],
    })).toMatchObject({ status: "ok", error: null })
  })
})
