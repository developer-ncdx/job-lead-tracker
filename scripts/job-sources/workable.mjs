import {
  canonicalizeUrl,
  cleanText,
  extractBoardSlug,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

function formatLocations(rawJob) {
  const locations = Array.isArray(rawJob.locations)
    ? rawJob.locations
        .filter((location) => location?.hidden !== true)
        .map((location) =>
          [location.city, location.region, location.country]
            .map(cleanText)
            .filter(Boolean)
            .join(", "),
        )
        .filter(Boolean)
    : []

  if (locations.length > 0) {
    return [...new Set(locations)].join(" | ")
  }

  return [rawJob.city, rawJob.state, rawJob.country]
    .map(cleanText)
    .filter(Boolean)
    .join(", ")
}

export function normalizeWorkableJob(
  rawJob,
  { company = "" } = {},
) {
  const publishedAt =
    normalizeTimestamp(rawJob.published_on) ??
    normalizeTimestamp(rawJob.created_at)
  const location = formatLocations(rawJob)

  return {
    source: "workable",
    sourceJobId: normalizeSourceJobId(rawJob.shortcode || rawJob.url),
    company: cleanText(company),
    title: cleanText(rawJob.title),
    description: cleanText(rawJob.description),
    url: canonicalizeUrl(rawJob.url || rawJob.shortlink),
    location,
    isRemote:
      rawJob.telecommuting === true ||
      inferRemote(location, rawJob.title),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchWorkableJobs(
  boardConfig,
  { fetchImpl = fetch } = {},
) {
  const board = extractBoardSlug(boardConfig.board, "workable")

  if (!board) {
    throw new Error("Workable board configuration is missing `board`.")
  }

  const payload = await fetchJson(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(
      board,
    )}?details=true`,
    {
      fetchImpl,
      headers: {
        accept: "application/json",
        "user-agent": "JobLeadTracker/1.0",
      },
    },
  )

  if (!Array.isArray(payload.jobs)) {
    throw new Error(`Workable board ${board} returned an invalid payload.`)
  }

  return payload.jobs.map((job) =>
    normalizeWorkableJob(job, {
      company: payload.name || boardConfig.company,
    }),
  )
}
