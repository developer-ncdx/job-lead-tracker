import { cachedJob, createCrawlReader } from "./crawl-pages.mjs"
import { extractSmileDetail, extractSmileListings } from "./smileandhire-pages.mjs"
import { matchesTargetRole } from "./role-filter.mjs"

export function normalizeSmileJob(saved) {
  return {
    source: "smileandhire",
    sourceJobId: saved.sourceId,
    title: saved.title,
    url: saved.url,
    description: [saved.description, saved.salary && `Compensation: ${saved.salary}`, saved.employmentType && `Employment type: ${saved.employmentType}`, saved.hoursPerWeek && `Hours per week: ${saved.hoursPerWeek}`].filter(Boolean).join("\n\n"),
    company: saved.company,
    location: saved.location,
    isRemote: saved.isRemote,
  }
}

export async function fetchSmileAndHireJobs(config = {}, { fetchImpl = fetch, wait, state = { cache: {}, save: async () => {} }, now = new Date() } = {}) {
  const detailLimit = config.maxDetailPages ?? 3
  if (!Number.isInteger(detailLimit) || detailLimit < 1 || detailLimit > 3) throw new Error("Smile & Hire detail limit must be between 1 and 3")
  const read = createCrawlReader({ fetchImpl, wait })
  const observedAt = now.toISOString()
  const listings = extractSmileListings(await read("https://www.smileandhire.com/jobs"), observedAt)
  const jobs = []
  const pending = []
  for (const listing of listings) {
    if (!matchesTargetRole(listing) || !listing.isRemoteOnly) continue
    const cached = cachedJob(state.cache, listing.sourceId, observedAt)
    if (cached.fresh && cached.job) jobs.push(cached.job)
    else pending.push(listing)
  }
  pending.sort((a, b) => Number(Boolean(state.cache[a.sourceId])) - Number(Boolean(state.cache[b.sourceId])))
  for (const listing of pending.slice(0, detailLimit)) {
    const detailed = extractSmileDetail(await read(listing.url), listing, observedAt)
    const job = normalizeSmileJob(detailed)
    state.cache[listing.sourceId] = { job, checkedAt: observedAt, seenAt: observedAt }
    await state.save()
    jobs.push(job)
  }
  return jobs
}
