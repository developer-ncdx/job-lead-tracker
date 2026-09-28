import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://jobsearch.api.jobtechdev.se/search"
const DEFAULT_QUERIES = Object.freeze([
  "software developer",
  "software engineer",
  "frontend developer",
  "backend developer",
  "fullstack developer",
  "AI engineer",
])
const DEFAULT_PAGE_SIZE = 100

function normalizeJobTechTimestamp(value) {
  return normalizeTimestamp(value, "Europe/Stockholm")
}

function formatLocation(rawJob) {
  const address = rawJob.workplace_address ?? {}
  const values = [
    address.city,
    address.municipality,
    address.region,
    address.country,
  ]

  return [...new Set(values.map(cleanText).filter(Boolean))].join(", ")
}

export function normalizeJobTechJob(rawJob) {
  const publishedAt = normalizeJobTechTimestamp(rawJob.publication_date)
  const location = formatLocation(rawJob)
  const workplaceModel = cleanText(rawJob.workplace_model?.label)
  const description = cleanText(
    rawJob.description?.text || rawJob.description?.text_formatted,
  )

  return {
    source: "jobtech",
    sourceJobId: normalizeSourceJobId(
      rawJob.id || rawJob.external_id || rawJob.webpage_url,
    ),
    company: cleanText(
      rawJob.employer?.workplace || rawJob.employer?.name,
    ),
    title: cleanText(rawJob.headline),
    description,
    url: canonicalizeUrl(rawJob.webpage_url),
    location,
    isRemote:
      /\b(?:distans(?:arbete)?|hemifrån|remote)\b/i.test(workplaceModel) ||
      inferRemote(workplaceModel, location, rawJob.headline, description),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchJobTechJobs(
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
    Math.max(1, Number(config.pageSize ?? DEFAULT_PAGE_SIZE)),
    DEFAULT_PAGE_SIZE,
  )

  for (const query of queries) {
    for (let page = 0; page < pages; page += 1) {
      const offset = page * pageSize
      const url = new URL(config.endpoint ?? DEFAULT_ENDPOINT)
      url.searchParams.set("q", query)
      url.searchParams.set("limit", String(pageSize))
      url.searchParams.set("offset", String(offset))
      url.searchParams.set("sort", "pubdate-desc")

      if (config.publishedAfterMinutes) {
        url.searchParams.set(
          "published-after",
          String(config.publishedAfterMinutes),
        )
      }

      const payload = await fetchJson(url, {
        fetchImpl,
        headers: {
          accept: "application/json",
          "user-agent": "JobLeadTracker/1.0",
        },
      })

      if (!Array.isArray(payload.hits)) {
        throw new Error("JobTech returned an invalid jobs payload.")
      }

      for (const rawJob of payload.hits) {
        const job = normalizeJobTechJob(rawJob)
        jobsById.set(job.sourceJobId, job)
      }

      const total = Number(payload.total?.value ?? payload.total)
      if (
        payload.hits.length === 0 ||
        (Number.isFinite(total) && offset + payload.hits.length >= total)
      ) {
        break
      }
    }
  }

  return [...jobsById.values()]
}
