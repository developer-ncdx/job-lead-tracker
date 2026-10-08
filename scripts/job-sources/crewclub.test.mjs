import { describe, expect, it, vi } from "vitest"
import { extractCrewClubListings, fetchCrewClubJobs } from "./crewclub.mjs"
import { fetchConfiguredSourceResults } from "./index.mjs"
import { loadSourceConfig } from "./config.mjs"

const card = (slug, title, filled = false) => `<article class="cj-card ${filled ? "cj-card--filled" : ""}"><div class="cj-card__head"><span class="cj-card__type">Full Time</span><span class="cj-card__date">Sep 4, 2026</span></div><h3 class="cj-card__title"><a href="/jobs/${slug}/">${title}</a></h3><div class="cj-card__meta-row">₱80,000/month</div><div class="cj-card__meta-row">Monday - Friday</div><span class="cj-card__cat-pill">IT</span></article>`
const listing = (cards, page = 1, maxPages = 1) => `<!doctype html><html><div class="cj-page" data-cj-page="${page}" data-cj-max-pages="${maxPages}">${cards}</div></html>`

describe("Crew Club public crawler", () => {
  it("imports public metadata while excluding filled, unrelated, and onsite roles", () => {
    const html = listing(card("web-dev", "Web Developer") + card("filled", "AI Engineer", true) + card("sales", "Sales Development Representative") + card("onsite", "Onsite Software Developer"))
    const { jobs } = extractCrewClubListings(html)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ source: "crewclub", sourceJobId: "web-dev", company: null, isRemote: true, url: "https://joincrewclub.com/jobs/web-dev/", sourceTimestampLabel: "Posted Sep 4, 2026" })
    expect(jobs[0].description).toContain("₱80,000/month")
    expect(jobs[0].description).toContain("Sign in")
  })

  it("follows listing pagination, deduplicates, and never fetches signed-in details", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(listing(card("dev", "Software Developer"), 1, 2))).mockResolvedValueOnce(new Response(listing(card("dev", "Software Developer") + card("ai", "AI Engineer"), 2, 2)))
    const wait = vi.fn()
    expect(await fetchCrewClubJobs({}, { fetchImpl, wait })).toHaveLength(2)
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(["https://joincrewclub.com/crew-jobs/", "https://joincrewclub.com/crew-jobs/page/2/"])
    expect(wait).toHaveBeenCalledWith(5000)
  })

  it("fails visibly on changed layout, repeated pagination, or excessive page counts", async () => {
    expect(() => extractCrewClubListings("<h2>Sign In Required</h2>")).toThrow("pagination")
    expect(() => extractCrewClubListings(listing(card("dev", "Software Developer")), 2)).toThrow("pagination")
    await expect(fetchCrewClubJobs({ maxListingPages: 1 }, { fetchImpl: vi.fn().mockResolvedValue(new Response(listing(card("dev", "Software Developer"), 1, 2))) })).rejects.toThrow("exceeding")
    await expect(fetchCrewClubJobs({ maxListingPages: 11 })).rejects.toThrow("between 1 and 10")
  })

  it("participates in the scheduled source pipeline and honors its kill switch", async () => {
    const config = await loadSourceConfig()
    for (const [source, settings] of Object.entries(config)) {
      if (Array.isArray(settings)) config[source] = []
      else if (typeof settings === "object") config[source] = { enabled: source === "crewclub" }
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(listing(card("dev", "Software Developer"))))
    const results = await fetchConfiguredSourceResults(config, { fetchImpl, environment: {} })
    expect(results.find(result => result.name === "crewclub:web")).toMatchObject({ status: "ok", jobs: [{ source: "crewclub" }] })
    fetchImpl.mockClear()
    const skipped = await fetchConfiguredSourceResults(config, { fetchImpl, environment: { JOB_DISABLED_PUBLIC_FEEDS: "crewclub" } })
    expect(skipped.find(result => result.name === "crewclub:web").status).toBe("skipped")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
