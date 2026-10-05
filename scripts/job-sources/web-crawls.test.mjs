import { describe, expect, it, vi } from "vitest"
import { createCrawlReader } from "./crawl-pages.mjs"
import { fetchOnlineJobsPhJobs } from "./onlinejobsph.mjs"
import { fetchSmileAndHireJobs } from "./smileandhire.mjs"

const onlineUrl = "https://www.onlinejobs.ph/jobseekers/job/automation-specialist-123"
const onlineSearch = `<!doctype html><html><a href="${onlineUrl}">Job</a></html>`
const onlineDetail = '<!doctype html><html><body><h1>Automation Specialist</h1>TYPE OF WORK Full Time WAGE / SALARY $10/hr HOURS PER WEEK 40 DATE UPDATED Oct 6, 2026 JOB OVERVIEW Automate workflows remotely. SKILL REQUIREMENT JavaScript</body></html>'
const now = new Date("2026-10-06T01:00:00Z")

const smileId = "6625c8c9-7d5e-4f87-a22b-35767ff331b2"
const smileListing = `<!doctype html><html><a href="/jobs/${smileId}"><div><div><div><span>AI Strategy</span><span>The VA Group, LLC</span></div><h3>AI Implementation Specialist (Client Systems Architect)</h3><div><span>Full-Time</span><span>·</span><span>Expert level</span><span>·</span><span title="Remote / Flexible"><svg class="lucide-map-pin"></svg>Remote / Flexible</span><span>·</span><span title="40"><svg class="lucide-clock-3"></svg>40</span></div><p>Build workflow automations.</p></div><div><span>$10/hr</span></div></div></a></html>`
const smileDetail = '<!doctype html><html><h1>AI Implementation Specialist (Client Systems Architect)</h1><h3>Job Description</h3><div><p>Build and maintain remote AI workflows.</p></div></html>'

describe("hourly public web sources", () => {
  it("shares five-second spacing across OnlineJobs keyword and detail requests and caches inspected IDs", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(onlineSearch)).mockResolvedValueOnce(new Response(onlineSearch)).mockResolvedValueOnce(new Response(onlineDetail))
    const wait = vi.fn()
    const state = { cache: {}, save: vi.fn() }
    const jobs = await fetchOnlineJobsPhJobs({ keywords: ["automation", "n8n"] }, { fetchImpl, wait, state, now })
    expect(jobs).toMatchObject([{ source: "onlinejobsph", sourceJobId: "123", sourceTimestampLabel: "Updated Oct 6, 2026" }])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls).toEqual([[5000], [5000]])
    expect(state.save).toHaveBeenCalledOnce()
    const laterFetch = vi.fn().mockImplementation(async () => new Response(onlineSearch))
    expect(await fetchOnlineJobsPhJobs({ keywords: ["automation", "n8n"] }, { fetchImpl: laterFetch, wait, state, now: new Date("2026-10-06T02:00:00Z") })).toEqual(jobs)
    expect(laterFetch).toHaveBeenCalledTimes(2)
  })

  it("bounds new detail requests and moves past already-inspected nonmatching and expired jobs", async () => {
    const nextUrl = "https://www.onlinejobs.ph/jobseekers/job/developer-124"
    const search = onlineSearch.replace("</html>", `<a href="${nextUrl}">Next</a></html>`)
    const state = { cache: {}, save: vi.fn() }
    const firstFetch = vi.fn().mockResolvedValueOnce(new Response(search)).mockResolvedValueOnce(new Response("Gone", { status: 410 }))
    expect(await fetchOnlineJobsPhJobs({ keywords: ["developer"], maxDetailPages: 1 }, { fetchImpl: firstFetch, wait: vi.fn(), state, now })).toEqual([])
    expect(firstFetch).toHaveBeenCalledTimes(2)
    const nextFetch = vi.fn().mockResolvedValueOnce(new Response(search)).mockResolvedValueOnce(new Response(onlineDetail.replace("Automation Specialist", "Software Developer")))
    const jobs = await fetchOnlineJobsPhJobs({ keywords: ["developer"], maxDetailPages: 1 }, { fetchImpl: nextFetch, wait: vi.fn(), state, now: new Date("2026-10-06T02:00:00Z") })
    expect(jobs[0].sourceJobId).toBe("124")
    expect(nextFetch.mock.calls[1][0]).toBe(nextUrl)
  })

  it("only inspects matching Smile & Hire details and reuses them on the next hourly run", async () => {
    const state = { cache: {}, save: vi.fn() }
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(smileListing)).mockResolvedValueOnce(new Response(smileDetail))
    const jobs = await fetchSmileAndHireJobs({}, { fetchImpl, wait: vi.fn(), state, now })
    expect(jobs).toMatchObject([{ source: "smileandhire", sourceJobId: smileId, company: "The VA Group, LLC", isRemote: true }])
    const nextFetch = vi.fn().mockResolvedValueOnce(new Response(smileListing))
    expect(await fetchSmileAndHireJobs({}, { fetchImpl: nextFetch, wait: vi.fn(), state, now: new Date("2026-10-06T02:00:00Z") })).toEqual(jobs)
    expect(nextFetch).toHaveBeenCalledOnce()
    const unrelated = smileListing.replace("AI Implementation Specialist (Client Systems Architect)", "AWS Architect")
    expect(await fetchSmileAndHireJobs({}, { fetchImpl: vi.fn().mockResolvedValue(new Response(unrelated)), wait: vi.fn(), state, now })).toEqual([])
  })

  it("refreshes cached details after 24 hours and validates request budgets", async () => {
    const state = { cache: { "123": { job: { title: "Old" }, checkedAt: "2026-10-04T00:00:00Z", seenAt: "2026-10-04T00:00:00Z" } }, save: vi.fn() }
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(onlineSearch)).mockResolvedValueOnce(new Response(onlineDetail))
    expect((await fetchOnlineJobsPhJobs({ keywords: ["automation"] }, { fetchImpl, wait: vi.fn(), state, now }))[0].title).toBe("Automation Specialist")
    await expect(fetchOnlineJobsPhJobs({ maxDetailPages: 7 }, { fetchImpl })).rejects.toThrow("between 1 and 6")
    await expect(fetchSmileAndHireJobs({ maxDetailPages: 4 }, { fetchImpl })).rejects.toThrow("between 1 and 3")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("stops on access blocks and rate limits, preserving Retry-After without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("Rate limited", { status: 429, headers: { "Retry-After": "7200" } }))
    const read = createCrawlReader({ fetchImpl, wait: vi.fn(), now: () => now })
    await expect(read(onlineUrl)).rejects.toMatchObject({ status: 429, cooldownUntil: "2026-10-06T03:00:00.000Z" })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const blocked = createCrawlReader({ fetchImpl: vi.fn().mockResolvedValue(new Response("Blocked", { status: 403 })), now: () => now })
    await expect(blocked(onlineUrl)).rejects.toMatchObject({ status: 403, cooldownUntil: "2026-10-07T01:00:00.000Z" })
  })
})
