import { describe, expect, it, vi } from "vitest"
import { fetchAylaJobs } from "./ayla.mjs"

const job = {
  id: "ayla-1",
  title: "Software Engineer",
  sourceUrl: "https://agency.example/jobs/1",
  workArrangement: "remote",
}
const response = (jobs = [job]) => new Response(JSON.stringify({
  jobs,
  pagination: { total: jobs.length, offset: 0 },
}), { headers: { "content-type": "application/json" } })
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError")

describe("Ayla timeout recovery", () => {
  it("recovers from a single timeout and keeps all queries and deduplication", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response([job, { ...job, id: "ayla-2" }]))
    const wait = vi.fn()
    const jobs = await fetchAylaJobs({ queries: ["software engineer", "software developer"] }, { fetchImpl, wait })

    expect(jobs.map(({ sourceJobId }) => sourceJobId)).toEqual(["ayla-1", "ayla-2"])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(String(fetchImpl.mock.calls[1][0])).toBe(String(fetchImpl.mock.calls[0][0]))
    expect(new URL(fetchImpl.mock.calls[2][0]).searchParams.get("search")).toBe("software developer")
    expect(wait).toHaveBeenCalledOnce()
  })

  it("reports a persistent timeout with the affected query after one retry", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(timeout())
    const wait = vi.fn()
    await expect(fetchAylaJobs({ queries: ["AI engineer"] }, { fetchImpl, wait }))
      .rejects.toThrow('Ayla "AI engineer" page 0: The operation was aborted due to timeout')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledOnce()
  })

  it("limits retries across queries so multiple slow searches cannot exhaust Vercel's duration", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(timeout())
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(timeout())
    const wait = vi.fn()
    await expect(fetchAylaJobs({ queries: ["software engineer", "AI engineer"] }, { fetchImpl, wait }))
      .rejects.toThrow('Ayla "AI engineer" page 0:')
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(wait).toHaveBeenCalledOnce()
  })

  it("does not retry access blocks, rate limits or invalid payloads", async () => {
    for (const result of [
      new Response("Blocked", { status: 403 }),
      new Response("Rate limited", { status: 429 }),
      new Response(JSON.stringify({ error: "Unavailable" })),
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(result)
      const wait = vi.fn()
      await expect(fetchAylaJobs({ queries: ["software engineer"] }, { fetchImpl, wait })).rejects.toThrow()
      expect(fetchImpl).toHaveBeenCalledOnce()
      expect(wait).not.toHaveBeenCalled()
    }
  })

  it("stops before starting another request after the total source budget expires", async () => {
    let currentTime = 0
    const fetchImpl = vi.fn(async () => {
      currentTime = 120_000
      return response()
    })
    await expect(fetchAylaJobs({ queries: ["software engineer", "AI engineer"] }, {
      fetchImpl,
      now: () => currentTime,
    })).rejects.toThrow("Ayla request budget exhausted")
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
})
