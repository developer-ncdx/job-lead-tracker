import { describe, expect, it, vi } from "vitest"
import { captureCrawlResult, claimCrawlState } from "./crawl-state.mjs"

function stateClient() {
  const row = { id: "state-id", source: "onlinejobsph", user_id: null, cache: {}, lease_token: null, lease_until: null, cooldown_until: null }
  const client = {
    from: () => {
      let changes
      const filters = []
      const query = {
        upsert: async () => ({ error: null }),
        select: () => query,
        eq: (key, value) => { filters.push([key, value]); return query },
        is: (key, value) => { filters.push([key, value]); return query },
        update: values => { changes = values; return query },
        single: async () => ({ data: structuredClone(row), error: null }),
        maybeSingle: async () => {
          if (filters.some(([key, value]) => row[key] !== value)) return { data: null, error: null }
          Object.assign(row, structuredClone(changes))
          return { data: { id: row.id }, error: null }
        },
      }
      return query
    },
  }
  return { client, row }
}

describe("server crawler state", () => {
  it("allows exactly one concurrent claimant and releases the lease after saving its cache", async () => {
    const { client, row } = stateClient()
    const claims = await Promise.all([claimCrawlState(client, "onlinejobsph", null), claimCrawlState(client, "onlinejobsph", null)])
    expect(claims.filter(claim => !claim.skipped)).toHaveLength(1)
    const owner = claims.find(claim => !claim.skipped)
    owner.cache["123"] = { job: { title: "Automation Specialist" }, checkedAt: new Date().toISOString(), seenAt: new Date().toISOString() }
    await owner.save()
    expect(row.cache["123"].job.title).toBe("Automation Specialist")
    await owner.finish()
    expect(row.lease_token).toBeNull()
    expect(row.last_succeeded_at).toBeTruthy()
  })

  it("persists provider cooldowns and makes no network requests during them", async () => {
    const { client, row } = stateClient()
    const error = Object.assign(new Error("HTTP 429"), { cooldownUntil: "2099-01-01T00:00:00Z" })
    const fetchJobs = vi.fn().mockRejectedValue(error)
    expect(await captureCrawlResult("onlinejobsph", fetchJobs, { client })).toMatchObject({ status: "failed", error: "HTTP 429" })
    expect(row.cooldown_until).toBe(error.cooldownUntil)
    expect(row.lease_token).toBeNull()
    fetchJobs.mockClear()
    expect(await captureCrawlResult("onlinejobsph", fetchJobs, { client })).toMatchObject({ status: "skipped", jobs: [] })
    expect(fetchJobs).not.toHaveBeenCalled()
  })

  it("does not crawl when private state cannot be created", async () => {
    const fetchJobs = vi.fn()
    const client = { from: () => ({ upsert: async () => ({ error: { message: "State table not deployed" } }) }) }
    expect(await captureCrawlResult("onlinejobsph", fetchJobs, { client })).toMatchObject({ status: "failed", error: "Crawler state is unavailable: State table not deployed" })
    expect(fetchJobs).not.toHaveBeenCalled()
  })
})
