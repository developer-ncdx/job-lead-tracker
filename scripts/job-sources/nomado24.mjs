import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://api.nomado24.de/api/public/v1/jobs"
const DEFAULT_QUERIES = Object.freeze([
  "software",
  "developer",
  "AI engineer",
  "automation",
])
const MAX_PAGE_SIZE = 50

export function normalizeNomado24Job(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.publishedAt)
  const location = cleanText(rawJob.location)

  return {
    source: "nomado24",
    sourceJobId: normalizeSourceJobId(rawJob.slug || rawJob.url),
    company: cleanText(rawJob.companyName),
    title: cleanText(rawJob.title),
    description: "",
    url: canonicalizeUrl(rawJob.url),
    location,
    isRemote:
      rawJob.remote === true ||
      /\bremote\b/i.test(String(rawJob.workArrangement ?? "")) ||
      inferRemote(location, rawJob.title),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchNomado24Jobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const jobsById = new Map()
  const queries =
    Array.isArray(config.queries) && config.queries.length > 0
      ? config.queries
      : DEFAULT_QUERIES
  const pages = Math.max(1, Number(config.pages ?? 1))
  const pageSize = Math.min(
    Math.max(1, Number(config.pageSize ?? MAX_PAGE_SIZE)),
    MAX_PAGE_SIZE,
  )

  for (const query of queries) {
    for (let page = 1; page <= pages; page += 1) {
      const url = new URL(config.endpoint ?? DEFAULT_ENDPOINT)
      url.searchParams.set("q", query)
      url.searchParams.set("page", String(page))
      url.searchParams.set("per_page", String(pageSize))

      const payload = await fetchJson(url, {
        fetchImpl,
        headers: {
          accept: "application/json",
          "user-agent": "JobLeadTracker/1.0",
        },
      })

      if (!Array.isArray(payload.data)) {
        throw new Error("Nomado24 returned an invalid jobs payload.")
      }

      for (const rawJob of payload.data) {
        const job = normalizeNomado24Job(rawJob)
        jobsById.set(job.sourceJobId, job)
      }

      if (payload.data.length < pageSize) {
        break
      }
    }
  }

  return [...jobsById.values()]
}
