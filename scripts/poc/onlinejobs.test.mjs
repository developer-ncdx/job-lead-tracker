import { describe, expect, it, vi } from "vitest"
import { brotliCompressSync } from "node:zlib"
import { crawl, decodeHtml, extractJob, extractJobLinks } from "./onlinejobs.mjs"

const url = "https://www.onlinejobs.ph/jobseekers/job/Developer-123"
const html = '<!doctype html><html><body><h1>Developer &amp; Designer</h1>TYPE OF WORK Full Time WAGE / SALARY $10/hr HOURS PER WEEK 40 DATE UPDATED Oct 5, 2026 JOB OVERVIEW Build apps. SKILL REQUIREMENT JavaScript</body></html>'

describe("OnlineJobs bounded POC", () => {
  it("decodes HTML arriving as Brotli bytes without encoding headers", () => {
    expect(decodeHtml(brotliCompressSync(Buffer.from(html)))).toBe(html)
    expect(decodeHtml(Buffer.from(html))).toBe(html)
  })
  it("rejects non-HTML responses and pages without expected job content", () => {
    expect(() => decodeHtml(Buffer.from("Access denied"))).toThrow("Stopped")
    expect(() => extractJob("<html><h1>Verify access</h1></html>", url)).toThrow("Expected job content missing")
  })
  it("deduplicates job links and rejects other hosts and private routes", () => {
    expect(extractJobLinks(`<a href="${url}">Job</a><a href="${url}?x=1">Duplicate</a><a href="https://example.com/jobseekers/job/Developer-123">External</a><a href="/jobseekers/info/123">Profile</a>`)).toEqual([url])
  })
  it("extracts public fields without confusing updated date with posting date", () => {
    expect(extractJob(html, url)).toMatchObject({ title: "Developer & Designer", salary: "$10/hr", employmentType: "Full Time", hoursPerWeek: "40", dateUpdated: "Oct 5, 2026", description: "Build apps." })
  })
  it("waits five seconds before fetching a detail page", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(`<!doctype html><html><a href="${url}">Job</a></html>`)).mockResolvedValueOnce(new Response(html))
    const wait = vi.fn()
    const jobs = await crawl({ searchUrl: "https://www.onlinejobs.ph/jobseekers/jobsearch", limit: 1, fetchImpl, wait })
    expect(jobs).toHaveLength(1)
    expect(wait).toHaveBeenCalledWith(5000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it("stops on rate limits without retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("Blocked", { status: 429 }))
    await expect(crawl({ searchUrl: "https://www.onlinejobs.ph/jobseekers/jobsearch", fetchImpl })).rejects.toThrow("HTTP 429")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
  it("skips job IDs already extracted for another keyword, including changed slugs", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<!doctype html><html><a href="/jobseekers/job/New-slug-123">Job</a></html>'))
    const wait = vi.fn()
    expect(await crawl({ searchUrl: "https://www.onlinejobs.ph/jobseekers/jobsearch", fetchImpl, wait, seenIds: new Set(["123"]) })).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(wait).not.toHaveBeenCalled()
  })
  it("skips a gone detail page and continues without retrying it", async () => {
    const otherUrl = "https://www.onlinejobs.ph/jobseekers/job/Another-124"
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(`<!doctype html><html><a href="${url}">Old</a><a href="${otherUrl}">New</a></html>`))
      .mockResolvedValueOnce(new Response("Gone", { status: 410 }))
      .mockResolvedValueOnce(new Response(html))
    const onSkipped = vi.fn()
    const jobs = await crawl({ searchUrl: "https://www.onlinejobs.ph/jobseekers/jobsearch", fetchImpl, wait: vi.fn(), onSkipped })
    expect(jobs.map(job => job.sourceId)).toEqual(["124"])
    expect(onSkipped).toHaveBeenCalledWith({ url, status: 410, reason: "gone" })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})
