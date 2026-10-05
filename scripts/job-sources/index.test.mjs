import { describe, expect, it, vi } from "vitest"

import { loadSourceConfig } from "./config.mjs"
import { fetchConfiguredSourceResults } from "./index.mjs"

describe("source selection", () => {
  it("includes both configured web sources in the shared sync and honors their kill switch", async () => {
    const config = await loadSourceConfig()
    for (const [source, settings] of Object.entries(config)) {
      if (Array.isArray(settings)) config[source] = []
      else if (typeof settings === "object" && !["onlinejobsph", "smileandhire"].includes(source)) config[source] = { enabled: false }
    }
    config.onlinejobsph = { enabled: true, keywords: ["automation"], maxDetailPages: 1 }
    const onlineUrl = "https://www.onlinejobs.ph/jobseekers/job/automation-specialist-123"
    const fetchImpl = vi.fn(async url => new Response(url === onlineUrl
      ? '<!doctype html><html><body><h1>Automation Specialist</h1>TYPE OF WORK Full Time WAGE / SALARY $10/hr HOURS PER WEEK 40 DATE UPDATED Oct 6, 2026 JOB OVERVIEW Remote workflows. SKILL REQUIREMENT JavaScript</body></html>'
      : url.includes("onlinejobs.ph")
        ? `<!doctype html><html><a href="${onlineUrl}">Job</a></html>`
        : '<!doctype html><html><a href="/jobs/6625c8c9-7d5e-4f87-a22b-35767ff331b2"><div><div><div><span>Cloud</span><span>Company</span></div><h3>AWS Architect</h3><div><span>Full-Time</span><span>Expert</span><span title="Remote"><svg class="lucide-map-pin"></svg>Remote</span></div><p>Cloud work.</p></div><div><span>$10/hr</span></div></div></a></html>'))
    const results = await fetchConfiguredSourceResults(config, { environment: {}, fetchImpl, wait: vi.fn() })
    expect(results.find(result => result.name === "onlinejobsph:web")).toMatchObject({ status: "ok", jobs: [{ source: "onlinejobsph", sourceJobId: "123" }] })
    expect(results.find(result => result.name === "smileandhire:web")).toMatchObject({ status: "ok", jobs: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    fetchImpl.mockClear()
    const skipped = await fetchConfiguredSourceResults(config, { environment: { JOB_DISABLED_PUBLIC_FEEDS: "onlinejobsph,smileandhire" }, fetchImpl })
    expect(fetchImpl).not.toHaveBeenCalled()
    for (const name of ["onlinejobsph:web", "smileandhire:web"]) expect(skipped.find(result => result.name === name).status).toBe("skipped")
  })

  it("skips a production-blocked public feed without disabling it locally", async () => {
    const config = await loadSourceConfig()
    for (const board of [
      "greenhouse",
      "ashby",
      "lever",
      "smartrecruiters",
      "workable",
      "personio",
    ]) {
      config[board] = []
    }
    for (const feed of [
      "weworkremotely",
      "remotive",
      "remoteok",
      "jobicy",
      "himalayas",
      "arbeitnow",
      "arbeitnowuk",
      "themuse",
      "jobtech",
      "eures",
      "ayla",
      "nomado24",
      "onlinejobsph",
      "smileandhire",
    ]) {
      config[feed] = { enabled: feed === "arbeitnowuk" }
    }
    config.jooble = { enabled: false }
    const fetchImpl = vi.fn()

    const results = await fetchConfiguredSourceResults(config, {
      environment: { JOB_DISABLED_PUBLIC_FEEDS: " arbeitnowuk " },
      fetchImpl,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(results).toContainEqual(
      expect.objectContaining({
        name: "arbeitnowuk:global",
        status: "skipped",
        error: "disabled by JOB_DISABLED_PUBLIC_FEEDS",
      }),
    )
  })
})
