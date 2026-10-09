import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://aylagov.com/api/jobs/search"
const DEFAULT_QUERIES = Object.freeze([
  "software engineer",
  "software developer",
  "frontend developer",
  "backend developer",
  "AI engineer",
  "automation engineer",
])
const MAX_PAGE_SIZE = 100
const REQUEST_TIMEOUT_MS = 30_000
const FETCH_BUDGET_MS = 120_000
const RETRY_DELAY_MS = 500

export function normalizeAylaJob(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.postedDate)
  const location = cleanText(
    rawJob.locationText ||
      [rawJob.city, rawJob.stateCode].filter(Boolean).join(", "),
  )
  const workArrangement = cleanText(rawJob.workArrangement).toLowerCase()

  return {
    source: "ayla",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company: cleanText(rawJob.agency || rawJob.department),
    title: cleanText(rawJob.title),
    description: "",
    url: canonicalizeUrl(rawJob.sourceUrl),
    location,
    isRemote:
      workArrangement === "remote" ||
      inferRemote(location, rawJob.title),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchAylaJobs(
  config = {},
  {
    fetchImpl = fetch,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  } = {},
) {
  const jobsById = new Map()
  const deadline = now() + FETCH_BUDGET_MS
  let retriedTimeout = false

  async function fetchPage(url, query, page) {
    while (true) {
      const remainingMs = deadline - now()
      if (remainingMs <= 0) {
        throw new Error(`Ayla request budget exhausted while fetching "${query}" page ${page}.`)
      }
      try {
        return await fetchJson(url, {
          fetchImpl,
          timeoutMs: Math.min(REQUEST_TIMEOUT_MS, remainingMs),
          headers: {
            accept: "application/json",
            "user-agent": "JobLeadTracker/1.0",
          },
        })
      } catch (error) {
        // One retry across the entire source keeps slow queries within the
        // Vercel function budget. HTTP and payload errors are not retried.
        if (error?.name !== "TimeoutError" || retriedTimeout || deadline - now() <= RETRY_DELAY_MS) {
          throw new Error(`Ayla "${query}" page ${page}: ${error?.message ?? String(error)}`, { cause: error })
        }
        retriedTimeout = true
        await wait(RETRY_DELAY_MS)
      }
    }
  }
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
    for (let page = 0; page < pages; page += 1) {
      const url = new URL(config.endpoint ?? DEFAULT_ENDPOINT)
      url.searchParams.set("search", query)
      url.searchParams.set("page", String(page))
      url.searchParams.set("limit", String(pageSize))
      url.searchParams.set("sortBy", "newest")

      const payload = await fetchPage(url, query, page)

      if (!Array.isArray(payload.jobs)) {
        throw new Error("Ayla returned an invalid jobs payload.")
      }

      for (const rawJob of payload.jobs) {
        const job = normalizeAylaJob(rawJob)
        jobsById.set(job.sourceJobId, job)
      }

      const total = Number(payload.pagination?.total)
      const offset = Number(payload.pagination?.offset ?? page * pageSize)

      if (
        payload.jobs.length === 0 ||
        (Number.isFinite(total) && offset + payload.jobs.length >= total)
      ) {
        break
      }
    }
  }

  return [...jobsById.values()]
}
