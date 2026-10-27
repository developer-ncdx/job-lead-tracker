import { describe, expect, it, vi } from "vitest"
import { fetchJson, fetchText } from "./shared.mjs"
import { fetchGreenhouseJobs } from "./greenhouse.mjs"
import { fetchWeWorkRemotelyJobs } from "./we-work-remotely.mjs"

const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError")

describe("job source timeout recovery", () => {
  it("retries a Greenhouse timeout once and imports the returned jobs", async () => {
    const fetchImpl = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce(Response.json({ jobs: [{
      id: 42, title: "Software Engineer", absolute_url: "https://example.com/jobs/42", location: { name: "Remote" },
    }] }))
    const wait = vi.fn()
    const jobs = await fetchGreenhouseJobs({ board: "stripe", company: "Stripe" }, { fetchImpl, wait })
    expect(jobs).toMatchObject([{ source: "greenhouse", sourceJobId: "42", title: "Software Engineer" }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[1][0]).toBe(fetchImpl.mock.calls[0][0])
    expect(fetchImpl.mock.calls[1][1].signal).not.toBe(fetchImpl.mock.calls[0][1].signal)
    expect(wait.mock.calls).toEqual([[500]])
  })

  it("recovers a We Work Remotely feed timeout and parses the RSS", async () => {
    const xml = '<rss><channel><item><title>Acme: Software Engineer</title><link>https://example.com/jobs/1</link><guid>job-1</guid></item></channel></rss>'
    const fetchImpl = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce(new Response(xml))
    const jobs = await fetchWeWorkRemotelyJobs({}, { fetchImpl, wait: vi.fn() })
    expect(jobs).toMatchObject([{ source: "weworkremotely", title: "Software Engineer", company: "Acme" }])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("also recovers when a response body times out after the headers arrive", async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce((_url, { signal }) => ({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("The operation was aborted", "AbortError")), { once: true })
        }),
      }))
      .mockResolvedValueOnce(Response.json({ jobs: [] }))
    expect(await fetchJson("https://example.com/jobs", { fetchImpl, retryTimeouts: true, timeoutMs: 5, wait: vi.fn() })).toEqual({ jobs: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("still fails after the second timeout for both JSON and text requests", async () => {
    for (const read of [fetchJson, fetchText]) {
      const fetchImpl = vi.fn().mockRejectedValue(timeout())
      const wait = vi.fn()
      await expect(read("https://example.com/jobs", { fetchImpl, retryTimeouts: true, wait })).rejects.toThrow("timeout")
      expect(fetchImpl).toHaveBeenCalledTimes(2)
      expect(wait).toHaveBeenCalledOnce()
    }
  })

  it("does not retry HTTP errors, invalid JSON, or unrelated cancellations", async () => {
    for (const status of [403, 429, 500]) {
      for (const read of [fetchJson, fetchText]) {
        const fetchImpl = vi.fn().mockResolvedValue(new Response("Unavailable", { status }))
        await expect(read("https://example.com/jobs", { fetchImpl, retryTimeouts: true, wait: vi.fn() })).rejects.toThrow(String(status))
        expect(fetchImpl).toHaveBeenCalledOnce()
      }
    }
    const invalid = vi.fn().mockResolvedValue(new Response("not JSON"))
    await expect(fetchJson("https://example.com/jobs", { fetchImpl: invalid, retryTimeouts: true, wait: vi.fn() })).rejects.toThrow()
    expect(invalid).toHaveBeenCalledOnce()
    const cancelled = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"))
    await expect(fetchJson("https://example.com/jobs", { fetchImpl: cancelled, retryTimeouts: true, wait: vi.fn() })).rejects.toThrow("Cancelled")
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it("keeps retries opt-in and never retries POST requests", async () => {
    for (const options of [{}, { method: "POST", retryTimeouts: true }]) {
      const fetchImpl = vi.fn().mockRejectedValue(timeout())
      const wait = vi.fn()
      await expect(fetchJson("https://example.com/jobs", { ...options, fetchImpl, wait })).rejects.toThrow("timeout")
      expect(fetchImpl).toHaveBeenCalledOnce()
      expect(wait).not.toHaveBeenCalled()
    }
  })
})
