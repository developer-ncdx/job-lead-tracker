import {
  canonicalizeUrl,
  cleanText,
  extractBoardSlug,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_QUERIES = Object.freeze([
  "software",
  "developer",
  "AI",
  "automation",
])
const MAX_PAGE_SIZE = 100

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

export function normalizeSmartRecruitersJob(rawJob, boardConfig = {}) {
  const publishedAt = normalizeTimestamp(rawJob.releasedDate)
  const companyIdentifier =
    rawJob.company?.identifier ||
    extractBoardSlug(boardConfig.board, "smartrecruiters")
  const location = cleanText(
    rawJob.location?.fullLocation ||
      [
        rawJob.location?.city,
        rawJob.location?.region,
        rawJob.location?.country,
      ]
        .filter(Boolean)
        .join(", "),
  )

  return {
    source: "smartrecruiters",
    sourceJobId: normalizeSourceJobId(rawJob.id || rawJob.uuid),
    company: cleanText(rawJob.company?.name || boardConfig.company),
    title: cleanText(rawJob.name),
    description: "",
    url: canonicalizeUrl(
      `https://jobs.smartrecruiters.com/${encodeURIComponent(
        companyIdentifier,
      )}/${encodeURIComponent(rawJob.id)}-${slugify(rawJob.name)}`,
    ),
    location,
    isRemote: inferRemote(location, rawJob.name),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchSmartRecruitersJobs(
  boardConfig,
  { fetchImpl = fetch } = {},
) {
  const companyIdentifier = extractBoardSlug(
    boardConfig.board,
    "smartrecruiters",
  )

  if (!companyIdentifier) {
    throw new Error(
      "SmartRecruiters board configuration is missing `board`.",
    )
  }

  const jobsById = new Map()
  const queries =
    Array.isArray(boardConfig.queries) && boardConfig.queries.length > 0
      ? boardConfig.queries
      : DEFAULT_QUERIES
  const pages = Math.max(1, Number(boardConfig.pages ?? 2))
  const pageSize = Math.min(
    Math.max(1, Number(boardConfig.pageSize ?? MAX_PAGE_SIZE)),
    MAX_PAGE_SIZE,
  )

  for (const query of queries) {
    for (let page = 0; page < pages; page += 1) {
      const offset = page * pageSize
      const url = new URL(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
          companyIdentifier,
        )}/postings`,
      )
      url.searchParams.set("q", query)
      url.searchParams.set("limit", String(pageSize))
      url.searchParams.set("offset", String(offset))

      const payload = await fetchJson(url, {
        fetchImpl,
        headers: {
          accept: "application/json",
          "user-agent": "JobLeadTracker/1.0",
        },
      })

      if (!Array.isArray(payload.content)) {
        throw new Error(
          `SmartRecruiters board ${companyIdentifier} returned an invalid payload.`,
        )
      }

      for (const rawJob of payload.content) {
        const job = normalizeSmartRecruitersJob(rawJob, boardConfig)
        jobsById.set(job.sourceJobId, job)
      }

      const total = Number(payload.totalFound)
      if (
        payload.content.length === 0 ||
        (Number.isFinite(total) && offset + payload.content.length >= total)
      ) {
        break
      }
    }
  }

  return [...jobsById.values()]
}
