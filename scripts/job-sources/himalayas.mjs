import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://himalayas.app/jobs/api"
const DEFAULT_PAGES = 5
const MAX_PAGE_SIZE = 20

function formatLocations(values) {
  return Array.isArray(values)
    ? values.map(cleanText).filter(Boolean).join(", ")
    : cleanText(values)
}

export function normalizeHimalayasJob(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.pubDate)
  const url = canonicalizeUrl(rawJob.applicationLink || rawJob.guid)

  return {
    source: "himalayas",
    sourceJobId: normalizeSourceJobId(rawJob.guid || url),
    company: cleanText(rawJob.companyName),
    title: cleanText(rawJob.title),
    description: cleanText(rawJob.description || rawJob.excerpt),
    url,
    location: formatLocations(rawJob.locationRestrictions) || "Worldwide",
    isRemote: true,
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchHimalayasJobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const jobs = []
  const pages = Math.max(1, Number(config.pages ?? DEFAULT_PAGES))
  let cursor = null

  for (let page = 0; page < pages; page += 1) {
    const url = new URL(config.endpoint ?? DEFAULT_ENDPOINT)
    url.searchParams.set(
      "limit",
      String(Math.min(Number(config.pageSize ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE)),
    )

    if (cursor) {
      url.searchParams.set("cursor", cursor)
    }

    const payload = await fetchJson(url, {
      fetchImpl,
      headers: {
        accept: "application/json",
        "user-agent": "JobLeadTracker/1.0",
      },
    })

    if (!Array.isArray(payload.jobs)) {
      throw new Error("Himalayas returned an invalid jobs payload.")
    }

    jobs.push(...payload.jobs.map(normalizeHimalayasJob))
    cursor = payload.nextCursor

    if (!cursor || payload.jobs.length === 0) {
      break
    }
  }

  return jobs
}
