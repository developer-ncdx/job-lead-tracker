import { describe, expect, it, vi } from "vitest"

import { backfillLinkedInTimestamps } from "./linkedin-timestamp-backfill.mjs"

function createClient(
  rows,
  {
    loadError = null,
    legacyRows = rows,
    legacyLoadError = null,
    updateError = null,
  } = {},
) {
  const updateEq = vi.fn().mockResolvedValue({ error: updateError })
  let loadCount = 0
  const table = {
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    is: vi.fn(() => table),
    limit: vi.fn(() => {
      loadCount += 1
      return Promise.resolve(
        loadCount === 1
          ? { data: rows, error: loadError }
          : { data: legacyRows, error: legacyLoadError },
      )
    }),
    update: vi.fn(() => ({ eq: updateEq })),
  }

  return {
    client: { from: vi.fn(() => table) },
    table,
    updateEq,
  }
}

const row = {
  id: "lead-1",
  source_job_id: "4427682709",
  url: "https://www.linkedin.com/jobs/view/4427682709",
}
const observedAt = "2026-09-29T19:40:00.000Z"

describe("LinkedIn timestamp backfill", () => {
  it("stores LinkedIn's relative provider label", async () => {
    const { client, table, updateEq } = createClient([row])
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        '<span class="posted-time-ago__text">Reposted 2 days ago</span>',
      ),
    )

    const summary = await backfillLinkedInTimestamps(client, {
      fetchImpl,
      observedAt,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/view/4427682709",
      expect.any(Object),
    )
    expect(table.update).toHaveBeenCalledWith({
      source_timestamp_at: null,
      source_timestamp_kind: null,
      source_timestamp_label: "Reposted 2 days ago",
      last_seen_at: observedAt,
    })
    expect(updateEq).toHaveBeenCalledWith("id", "lead-1")
    expect(summary).toEqual({
      attempted: 1,
      updated: 1,
      unresolved: 0,
      labelsSkipped: 0,
      supportsTimestampLabels: true,
      failures: [],
    })
  })

  it("leaves a row unresolved when LinkedIn provides no date", async () => {
    const { client, table } = createClient([row])

    const summary = await backfillLinkedInTimestamps(client, {
      fetchImpl: vi.fn().mockResolvedValue(new Response("<html></html>")),
    })

    expect(table.update).not.toHaveBeenCalled()
    expect(summary).toMatchObject({
      attempted: 1,
      updated: 0,
      unresolved: 1,
      failures: [],
    })
  })

  it("stores an exact provider timestamp when LinkedIn supplies one", async () => {
    const { client, table } = createClient([row])
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      datePosted: "2026-09-27T09:01:19.000Z",
    })}</script>`

    const summary = await backfillLinkedInTimestamps(client, {
      fetchImpl: vi.fn().mockResolvedValue(new Response(html)),
      observedAt,
    })

    expect(table.update).toHaveBeenCalledWith({
      source_timestamp_at: "2026-09-27T09:01:19.000Z",
      source_timestamp_kind: "published",
      source_timestamp_label: null,
      last_seen_at: observedAt,
    })
    expect(summary.updated).toBe(1)
  })

  it("reports provider request failures without inventing a date", async () => {
    const { client, table } = createClient([row])

    const summary = await backfillLinkedInTimestamps(client, {
      fetchImpl: vi.fn().mockResolvedValue(
        new Response("Unavailable", { status: 429 }),
      ),
    })

    expect(table.update).not.toHaveBeenCalled()
    expect(summary).toMatchObject({
      attempted: 1,
      updated: 0,
      unresolved: 0,
      failures: [
        { sourceJobId: "4427682709", error: "HTTP 429" },
      ],
    })
  })

  it("still backfills exact dates when the provider label column is not deployed", async () => {
    const { client, table } = createClient([], {
      loadError: {
        message: "column job_leads.source_timestamp_label does not exist",
      },
      legacyRows: [row],
    })
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      datePosted: "2026-09-27T09:01:19.000Z",
    })}</script>`

    const summary = await backfillLinkedInTimestamps(client, {
      fetchImpl: vi.fn().mockResolvedValue(new Response(html)),
      observedAt,
    })

    expect(table.update).toHaveBeenCalledWith({
      source_timestamp_at: "2026-09-27T09:01:19.000Z",
      source_timestamp_kind: "published",
      last_seen_at: observedAt,
    })
    expect(summary).toMatchObject({
      attempted: 1,
      updated: 1,
      labelsSkipped: 0,
      supportsTimestampLabels: false,
      failures: [],
    })
  })

  it("reports relative labels that need the provider label column", async () => {
    const { client, table } = createClient([], {
      loadError: {
        message: "column job_leads.source_timestamp_label does not exist",
      },
      legacyRows: [row],
    })

    const summary = await backfillLinkedInTimestamps(client, {
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          '<span class="posted-time-ago__text">Reposted 2 days ago</span>',
        ),
      ),
    })

    expect(table.update).not.toHaveBeenCalled()
    expect(summary).toMatchObject({
      attempted: 1,
      updated: 0,
      labelsSkipped: 1,
      supportsTimestampLabels: false,
      failures: [],
    })
  })
})
