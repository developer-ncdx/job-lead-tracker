import { describe, expect, it, vi } from "vitest"
import { brotliCompressSync, gzipSync } from "node:zlib"
import { crawlSmile, extractSmileDetail, extractSmileListings, fetchSupabaseJson, importSmileJobs, smileJobUrl } from "./smileandhire.mjs"

const id = "6625c8c9-7d5e-4f87-a22b-35767ff331b2"
const url = `https://www.smileandhire.com/jobs/${id}`
function listing(title = "Automation Specialist", location = "Remote / Flexible") {
  return `<!doctype html><html><body><a href="/jobs/${id}"><div><div><div><span>AI Strategy</span><span>The VA Group, LLC</span></div><h3>${title}</h3><div><span>Full-Time</span><span>·</span><span>Expert level</span><span>·</span><span title="${location}"><svg class="lucide-map-pin"></svg>${location}</span><span>·</span><span title="40"><svg class="lucide-clock-3"></svg>40</span></div><p>Build remote workflow automations.</p></div><div><span>$10/hr</span><span>Details</span></div></div></a></body></html>`
}
const detail = '<!doctype html><html><body><h1>Automation Specialist</h1><div><h3>Job Description</h3><div><p>Build automations from home.</p><p>Integrate APIs.</p></div></div><section><h2>What You\'ll Do</h2><div><div>Maintain workflows.</div></div></section><div><h3>Requirements</h3><ul><li>API experience.</li></ul></div><form>Private application controls</form></body></html>'

describe("Smile & Hire public extraction POC", () => {
  it("extracts job fields from public cards and applies the existing filters", () => {
    const [job] = extractSmileListings(listing(), "2026-10-05T15:00:00Z")
    expect(job).toMatchObject({ sourceId: id, url, title: "Automation Specialist", company: "The VA Group, LLC", salary: "$10/hr", employmentType: "Full-Time", hoursPerWeek: "40", location: "Remote / Flexible", matchesTargetRole: true, isRemoteOnly: true, descriptionKind: "listing_overview" })
    expect(extractSmileListings(listing("AI Implementation Specialist (Client Systems Architect)"))[0].matchesTargetRole).toBe(true)
    expect(extractSmileListings(listing("AI Implementation Specialist"))[0].matchesTargetRole).toBe(false)
    expect(extractSmileListings(listing("AWS Architect"))[0].matchesTargetRole).toBe(false)
    expect(extractSmileListings(listing("Automation Specialist", "Onsite"))[0].isRemoteOnly).toBe(false)
  })
  it("accepts public listing IDs, deduplicates links, and rejects other hosts or routes", () => {
    expect(smileJobUrl(`/jobs/c-${id}`)).toBe(`https://www.smileandhire.com/jobs/c-${id}`)
    expect(smileJobUrl(`https://example.com/jobs/${id}`)).toBeNull()
    expect(smileJobUrl("/login")).toBeNull()
    expect(extractSmileListings(listing().replace("</body>", `<a href="${url}?tracking=1"><h3>Duplicate</h3></a></body>`))).toHaveLength(1)
  })
  it("extracts full public descriptions and requirements without application forms", () => {
    const job = extractSmileDetail(detail, extractSmileListings(listing())[0])
    expect(job.description).toContain("Integrate APIs.")
    expect(job.description).toContain("Requirements\nAPI experience.")
    expect(job.description).not.toContain("Private application controls")
    expect(job.descriptionKind).toBe("job_detail")
    expect(() => extractSmileDetail(detail.replace("<h1>Automation Specialist", "<h1>Sign in"), job)).toThrow("title does not match")
  })
  it("fetches anonymously with five-second spacing and a strict detail limit", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(listing())).mockResolvedValueOnce(new Response(detail))
    const wait = vi.fn()
    const result = await crawlSmile({ fetchImpl, wait })
    expect(wait).toHaveBeenCalledExactlyOnceWith(5000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { "User-Agent": "JobLeadTracker-POC/0.1" } })
    expect(result.eligibleJobIds).toEqual([id])
    await expect(crawlSmile({ limit: 4, fetchImpl })).rejects.toThrow("between 0 and 3")
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
  it("stops on rate limits, invalid content, and missing job cards without retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("Blocked", { status: 429 }))
    await expect(crawlSmile({ fetchImpl })).rejects.toThrow("HTTP 429")
    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect(crawlSmile({ fetchImpl: vi.fn().mockResolvedValue(new Response("Not HTML")) })).rejects.toThrow("Stopped")
    expect(() => extractSmileListings("<html><h1>Sign in</h1></html>")).toThrow("no public job cards")
  })
  it("decodes public HTML arriving as Brotli bytes without encoding headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(brotliCompressSync(Buffer.from(listing()))))
    expect((await crawlSmile({ limit: 0, fetchImpl })).jobs).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })
  it("decodes compressed database JSON without changing errors or retrying requests", async () => {
    for (const encode of [gzipSync, brotliCompressSync]) {
      const body = { message: "Permission denied" }
      const fetchImpl = vi.fn().mockResolvedValue(new Response(encode(Buffer.from(JSON.stringify(body))), { status: 403 }))
      const response = await fetchSupabaseJson("https://example.supabase.co/rest/v1/job_leads", {}, fetchImpl)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual(body)
      expect(fetchImpl).toHaveBeenCalledOnce()
    }
    const response = new Response("[]")
    expect(await fetchSupabaseJson("https://example.supabase.co", {}, vi.fn().mockResolvedValue(response))).toBe(response)
  })
  it("imports only eligible new jobs and skips existing tracking without updating it", async () => {
    const job = extractSmileListings(listing())[0]
    const query = { select: vi.fn(), or: vi.fn(), order: vi.fn(), range: vi.fn(), is: vi.fn(), eq: vi.fn(), in: vi.fn() }
    for (const method of ["select", "or", "order", "range", "eq", "in"]) query[method].mockReturnValue(query)
    query.is.mockResolvedValue({ data: [], error: null })
    const selectInserted = vi.fn().mockResolvedValue({ data: [{ source_job_id: id, title: job.title }], error: null })
    const upsert = vi.fn().mockReturnValue({ select: selectInserted })
    const clientFactory = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ ...query, upsert }) })
    const environment = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key", JOB_LEADS_OWNER_ID: "00000000-0000-0000-0000-000000000000" }
    expect(await importSmileJobs([job, job], { environment, clientFactory })).toMatchObject({ eligible: 1, imported: [{ source_job_id: id }] })
    expect(query.is).toHaveBeenCalledWith("user_id", null)
    expect(upsert).toHaveBeenCalledWith([expect.objectContaining({ source: "smileandhire", source_job_id: id, user_id: null })], { onConflict: "user_id,source,source_job_id", ignoreDuplicates: true })
    for (const field of ["is_read", "applied_at", "not_interested_at", "is_priority"]) expect(upsert.mock.calls[0][0][0]).not.toHaveProperty(field)
    upsert.mockClear()
    query.is.mockResolvedValue({ data: [{ source: "other-import", source_job_id: "different-id", url, is_read: true, applied_at: "2026-10-05T15:00:00Z" }], error: null })
    expect(await importSmileJobs([job], { environment, clientFactory })).toEqual({ eligible: 1, imported: [], existing: 1 })
    expect(upsert).not.toHaveBeenCalled()
    expect(await importSmileJobs([{ ...job, title: "AWS Architect", matchesTargetRole: true }], { environment, clientFactory })).toEqual({ eligible: 0, imported: [], existing: 0 })
    query.is.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ source_job_id: id, title: job.title, url }], error: null })
    selectInserted.mockResolvedValueOnce({ data: null, error: { message: "Unreadable write response" } })
    expect(await importSmileJobs([job], { environment, clientFactory })).toMatchObject({ imported: [{ source_job_id: id }], verifiedAfterResponseError: true })
    expect(upsert).toHaveBeenCalledOnce()
    upsert.mockClear()
    query.is.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [], error: null })
    selectInserted.mockResolvedValueOnce({ data: null, error: { message: "Write failed" } })
    await expect(importSmileJobs([job], { environment, clientFactory })).rejects.toThrow("Could not confirm")
    expect(upsert).toHaveBeenCalledOnce()
  })
})
