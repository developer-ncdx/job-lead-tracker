import { cachedJob, createCrawlReader } from "./crawl-pages.mjs"
import { extractJob, extractJobLinks } from "./onlinejobsph-pages.mjs"

export function normalizeOnlineJobsJob(saved) {
  return {
    source: "onlinejobsph",
    sourceJobId: saved.sourceId,
    title: saved.title,
    url: saved.url,
    description: [saved.description, saved.employmentType && `Employment type: ${saved.employmentType}`, saved.salary && `Salary: ${saved.salary}`, saved.hoursPerWeek && `Hours per week: ${saved.hoursPerWeek}`].filter(Boolean).join("\n\n"),
    company: null,
    location: "Remote",
    isRemote: true,
    sourceTimestampKind: saved.dateUpdated ? "updated" : null,
    sourceTimestampLabel: saved.dateUpdated ? `Updated ${saved.dateUpdated}` : null,
  }
}

export async function fetchOnlineJobsPhJobs(config = {}, { fetchImpl = fetch, wait, state = { cache: {}, save: async () => {} }, now = new Date() } = {}) {
  const keywords = config.keywords ?? ["developer", "automation", "n8n", "AI engineer", "Bubble"]
  if (!Array.isArray(keywords) || !keywords.length || keywords.length > 5 || keywords.some(keyword => typeof keyword !== "string" || !keyword.trim())) throw new Error("OnlineJobs.ph requires 1–5 nonempty keywords")
  const detailLimit = config.maxDetailPages ?? 6
  if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 6) throw new Error("OnlineJobs.ph detail limit must be between 1 and 6")
  const read = createCrawlReader({ fetchImpl, wait })
  const candidates = new Map()
  for (const keyword of keywords) {
    const search = new URL("https://www.onlinejobs.ph/jobseekers/jobsearch")
    search.searchParams.set("jobkeyword", keyword)
    const links = extractJobLinks(await read(search.href))
    if (!links.length) throw new Error("OnlineJobs.ph public search cards are missing; crawl stopped")
    for (const url of links) candidates.set(url.match(/-(\d+)$/)[1], url)
  }
  const observedAt = now.toISOString()
  const jobs = []
  const pending = []
  for (const [id, url] of candidates) {
    const cached = cachedJob(state.cache, id, observedAt)
    if (cached.fresh) {
      if (cached.job) jobs.push(cached.job)
    } else {
      pending.push({ id, url, seenBefore: Boolean(state.cache[id]) })
    }
  }
  // New IDs precede daily refreshes of previously inspected details.
  pending.sort((a, b) => Number(a.seenBefore) - Number(b.seenBefore))
  for (const { id, url } of pending.slice(0, detailLimit)) {
    let job = null
    try { job = normalizeOnlineJobsJob(extractJob(await read(url), url)) }
    catch (error) { if (error.status !== 410) throw error }
    state.cache[id] = { job, checkedAt: observedAt, seenAt: observedAt }
    await state.save()
    if (job) jobs.push(job)
  }
  return jobs
}
