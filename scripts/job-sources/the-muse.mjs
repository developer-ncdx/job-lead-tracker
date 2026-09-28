import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://www.themuse.com/api/public/jobs"
const DEFAULT_PAGES = 3
const DEFAULT_CATEGORIES = Object.freeze([
  "Software Engineering",
  "Data Science",
  "Computer and IT",
  "IT",
])

function joinNames(values) {
  return Array.isArray(values)
    ? values.map((value) => cleanText(value?.name)).filter(Boolean).join(", ")
    : ""
}

export function normalizeTheMuseJob(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.publication_date)
  const location = joinNames(rawJob.locations)

  return {
    source: "themuse",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company: cleanText(rawJob.company?.name),
    title: cleanText(rawJob.name),
    description: cleanText(rawJob.contents),
    url: canonicalizeUrl(rawJob.refs?.landing_page),
    location,
    isRemote: inferRemote(location, rawJob.name),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchTheMuseJobs(
  config = {},
  { fetchImpl = fetch, environment = process.env } = {},
) {
  const jobsById = new Map()
  const pages = Math.max(1, Number(config.pages ?? DEFAULT_PAGES))
  const categories =
    Array.isArray(config.categories) && config.categories.length > 0
      ? config.categories
      : DEFAULT_CATEGORIES

  for (const category of categories) {
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL(config.endpoint ?? DEFAULT_ENDPOINT)
      url.searchParams.set("page", String(page))
      url.searchParams.set("descending", "true")
      url.searchParams.set("category", category)

      if (environment.THE_MUSE_API_KEY) {
        url.searchParams.set("api_key", environment.THE_MUSE_API_KEY)
      }

      const payload = await fetchJson(url, {
        fetchImpl,
        headers: {
          accept: "application/json",
          "user-agent": "JobLeadTracker/1.0",
        },
      })

      if (!Array.isArray(payload.results)) {
        throw new Error("The Muse returned an invalid jobs payload.")
      }

      for (const rawJob of payload.results) {
        const job = normalizeTheMuseJob(rawJob)
        jobsById.set(job.sourceJobId, job)
      }

      if (payload.results.length === 0 || page >= Number(payload.page_count)) {
        break
      }
    }
  }

  return [...jobsById.values()]
}
