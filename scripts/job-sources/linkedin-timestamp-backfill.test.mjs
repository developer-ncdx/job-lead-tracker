import { describe, expect, it, vi } from "vitest"

import { backfillLinkedInTimestamps } from "./linkedin-timestamp-backfill.mjs"

function createClient(rows, { loadError = null, updateError = null } = {}) {
  const updateEq = vi.fn().mockResolvedValue({ error: updateError })
  const table = {
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    is: vi.fn(() => table),
    limit: vi.fn().mockResolvedValue({ data: rows, error: loadError }),
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
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.linkedin.com/jobs/view/4427682709",
      expect.any(Object),
    )
    expect(table.update).toHaveBeenCalledWith({
      source_timestamp_at: null,
      source_timestamp_kind: null,
      source_timestamp_label: "Reposted 2 days ago",
    })
    expect(updateEq).toHaveBeenCalledWith("id", "lead-1")
    expect(summary).toEqual({
      attempted: 1,
      updated: 1,
      unresolved: 0,
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
    })

    expect(table.update).toHaveBeenCalledWith({
      source_timestamp_at: "2026-09-27T09:01:19.000Z",
      source_timestamp_kind: "published",
      source_timestamp_label: null,
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

  it("fails clearly when the provider label column is not deployed", async () => {
    const { client } = createClient([], {
      loadError: {
        message: "column job_leads.source_timestamp_label does not exist",
      },
    })

    await expect(backfillLinkedInTimestamps(client)).rejects.toThrow(
      "column job_leads.source_timestamp_label does not exist",
    )
  })
})
