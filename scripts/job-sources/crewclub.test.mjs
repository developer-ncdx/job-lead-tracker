import { describe, expect, it, vi } from "vitest"
import { extractCrewClubListings, fetchCrewClubJobs } from "./crewclub.mjs"
import { fetchConfiguredSourceResults } from "./index.mjs"
import { loadSourceConfig } from "./config.mjs"

const card = (slug, title, filled = false) => `<article class="cj-card ${filled ? "cj-card--filled" : ""}"><div class="cj-card__head"><span class="cj-card__type">Full Time</span><span class="cj-card__date">Sep 4, 2026</span></div><h3 class="cj-card__title"><a href="/jobs/${slug}/">${title}</a></h3><div class="cj-card__meta-row">₱80,000/month</div><div class="cj-card__meta-row">Monday - Friday</div><span class="cj-card__cat-pill">IT</span></article>`
const listing = (cards, page = 1, maxPages = 1) => `<!doctype html><html><div class="cj-page" data-cj-page="${page}" data-cj-max-pages="${maxPages}">${cards}</div></html>`
const payloadJob = (slug, title, extra = {}) => ({ slug, title, status: "open", postedAt: "2026-03-27T13:20:09.000Z", location: "Remote (Philippines)", employmentType: "Full Time", payRange: "₱150,000 per month", ...extra })
const nextListing = (jobs, { split = false, prefix = "", suffix = "", rendered = card("sales", "Sales Representative") } = {}) => {
  const stream = `${prefix}7:${JSON.stringify(["$", "$L14", null, { hub: { jobs } }])}\n${suffix}`
  const chunks = split ? [stream.slice(0, 42), stream.slice(42, 101), stream.slice(101)] : [stream]
  return `<!doctype html><html><div class="cj-page">${rendered}</div>${chunks.map(chunk => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`).join("")}</html>`
}

describe("Crew Club public crawler", () => {
  it("imports public metadata while excluding filled, unrelated, and onsite roles", () => {
    const html = listing(card("web-dev", "Web Developer") + card("filled", "AI Engineer", true) + card("sales", "Sales Development Representative") + card("onsite", "Onsite Software Developer"))
    const { jobs } = extractCrewClubListings(html)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ source: "crewclub", sourceJobId: "web-dev", company: null, isRemote: true, url: "https://joincrewclub.com/jobs/web-dev/", sourceTimestampKind: "published", sourceTimestampLabel: "Posted Sep 4, 2026" })
    expect(jobs[0].description).toContain("₱80,000/month")
    expect(jobs[0].description).toContain("Sign in")
  })

  it("follows listing pagination, deduplicates, and never fetches signed-in details", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(listing(card("dev", "Software Developer"), 1, 2))).mockResolvedValueOnce(new Response(listing(card("dev", "Software Developer") + card("ai", "AI Engineer"), 2, 2)))
    const wait = vi.fn()
    expect(await fetchCrewClubJobs({}, { fetchImpl, wait })).toHaveLength(2)
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(["https://joincrewclub.com/crew-jobs", "https://joincrewclub.com/crew-jobs/page/2"])
    expect(wait).toHaveBeenCalledWith(5000)
  })

  it("reads every Next.js listing beyond the first nine rendered cards in one canonical request", async () => {
    const jobs = [
      ...Array.from({ length: 9 }, (_, index) => payloadJob(`sales-${index}`, "Sales Representative")),
      payloadJob("senior-react-developer", "Senior React Developer"),
      payloadJob("filled", "AI Engineer", { status: "filled" }),
      payloadJob("onsite", "Software Developer", { location: "Onsite — Manila" }),
    ]
    const fetchImpl = vi.fn().mockResolvedValue(new Response(nextListing(jobs)))
    const result = await fetchCrewClubJobs({}, { fetchImpl, wait: vi.fn() })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl.mock.calls[0][0]).toBe("https://joincrewclub.com/crew-jobs")
    expect(fetchImpl.mock.calls[0][1].redirect).toBe("error")
    expect(result).toMatchObject([{
      source: "crewclub", sourceJobId: "senior-react-developer", title: "Senior React Developer",
      url: "https://joincrewclub.com/jobs/senior-react-developer", sourceTimestampKind: "published",
      sourceTimestampAt: "2026-03-27T13:20:09.000Z",
    }])
    expect(result[0].description).toContain("₱150,000 per month")
  })

  it("handles split payloads and byte-length text records without reading description-only data as jobs", () => {
    const fakeHub = JSON.stringify({ hub: { jobs: [payloadJob("fake", "AI Engineer")] } })
    const text = `₱ café — ${fakeHub}`
    const prefix = `1:I[8873,[],"JobsBoard"]\n2:T${Buffer.byteLength(text).toString(16)},${text}`
    const { jobs } = extractCrewClubListings(nextListing([payloadJob("real", "AI Engineer")], { split: true, prefix }))
    expect(jobs.map(job => job.sourceJobId)).toEqual(["real"])
  })

  it("does not execute page scripts or import full description sections", () => {
    const html = nextListing([payloadJob("dev", "Software Developer", { description: "Not card metadata", sections: { requirements: "Private description" } })])
      .replace("</html>", "<script>globalThis.crewClubScriptExecuted = true</script></html>")
    const { jobs } = extractCrewClubListings(html)
    expect(globalThis.crewClubScriptExecuted).toBeUndefined()
    expect(jobs[0].description).not.toContain("Not card metadata")
    expect(jobs[0].description).not.toContain("Private description")
  })

  it("fails visibly on malformed or incomplete new payloads rather than accepting only rendered cards", () => {
    const rendered = card("dev", "Software Developer")
    const missing = `<div class="cj-page">${rendered}</div><script>self.__next_f.push([1,"7:{}\\n"])</script>`
    expect(() => extractCrewClubListings(missing)).toThrow("public jobs payload")
    expect(() => extractCrewClubListings(nextListing([], { suffix: "8:{" }))).toThrow("incomplete")
    expect(() => extractCrewClubListings(nextListing([payloadJob("../wrong", "Software Developer")]))).toThrow("job URL")
    expect(() => extractCrewClubListings(nextListing([payloadJob("dev", "Software Developer")]), 2)).toThrow("pagination")
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
