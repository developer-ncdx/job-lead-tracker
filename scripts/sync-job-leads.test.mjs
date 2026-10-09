import { describe, expect, it, vi } from "vitest"

import { loadExistingLeads, summarizeLinkedInTimestampBackfill, upsertLeads } from "./sync-job-leads.mjs"
import { buildSupabaseRows } from "./job-sources/sync-utils.mjs"

it("reuses OnlineJobs email identities during web imports and leaves tracking fields untouched", async () => {
  const existing = { source: "onlinejobsph-email", source_job_id: "123", title: "My saved title", url: "https://www.onlinejobs.ph/jobseekers/job/saved-123", description: "My notes", is_read: true, applied_at: "2026-10-06T00:00:00Z", not_interested_at: null }
  const query = { select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn() }
  for (const name of ["select", "eq", "in"]) query[name].mockReturnValue(query)
  query.is.mockResolvedValue({ data: [existing], error: null })
  const client = { from: () => query }
  const jobs = [{ source: "onlinejobsph", sourceJobId: "123", title: "Automation Specialist", url: "https://www.onlinejobs.ph/jobseekers/job/new-slug-123", isRemote: true }]
  const map = await loadExistingLeads(client, null, jobs)
  expect(query.in).toHaveBeenCalledWith("source", ["onlinejobsph", "onlinejobsph-email"])
  const [row] = buildSupabaseRows(jobs, null, { existingByIdentity: map })
  expect(row).toMatchObject({ source: "onlinejobsph-email", source_job_id: "123", title: "My saved title", url: existing.url })
  expect(query.select.mock.calls[0][0].split(",")).not.toContain("description")
  expect(row).not.toHaveProperty("description")
  for (const field of ["is_read", "applied_at", "not_interested_at"]) expect(row).not.toHaveProperty(field)
})

it("separates new descriptions from existing refreshes so notes cannot be overwritten by bulk upsert", async () => {
  const jobs = [
    { source: "greenhouse", sourceJobId: "old", title: "Software Engineer", description: "Replacement text", url: "https://example.com/old" },
    { source: "greenhouse", sourceJobId: "new", title: "Software Engineer", description: "New job description", url: "https://example.com/new" },
  ]
  const existingByIdentity = new Map([["greenhouse:old", { title: "Saved title", url: jobs[0].url }]])
  const rows = buildSupabaseRows(jobs, null, { existingByIdentity })
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const onWritten = vi.fn()
  await upsertLeads({ from: () => ({ upsert }) }, rows, onWritten)
  expect(upsert).toHaveBeenCalledTimes(2)
  expect(upsert.mock.calls[0][0]).toMatchObject([{ source_job_id: "new", description: "New job description" }])
  expect(upsert.mock.calls[1][0]).toMatchObject([{ source_job_id: "old", title: "Saved title" }])
  expect(upsert.mock.calls[1][0][0]).not.toHaveProperty("description")
  expect(onWritten.mock.calls.flatMap(([batch]) => batch)).toHaveLength(2)
})

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
      error: "1 LinkedIn page request(s) failed (HTTP 429: 1)",
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

  it("keeps actual database write failures fatal even when LinkedIn pages also fail", () => {
    expect(summarizeLinkedInTimestampBackfill({
      attempted: 2,
      updated: 0,
      labelsSkipped: 0,
      failures: [
        { sourceJobId: "123", kind: "provider", error: "HTTP 429" },
        { sourceJobId: "456", kind: "database", error: "database unavailable" },
      ],
    })).toMatchObject({
      status: "failed",
      error: expect.stringContaining("1 database update(s) failed"),
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
