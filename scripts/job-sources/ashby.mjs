import {
  canonicalizeUrl,
  cleanText,
  combineText,
  extractBoardSlug,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
  titleCaseSlug,
} from "./shared.mjs"

export function normalizeAshbyJob(rawJob, boardConfig) {
  const primaryLocation = cleanText(rawJob.location)
  const secondaryLocations = Array.isArray(rawJob.secondaryLocations)
    ? rawJob.secondaryLocations
        .map((entry) => cleanText(entry?.location))
        .filter(Boolean)
    : []
  const location = [primaryLocation, ...secondaryLocations]
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(" | ")
  const url = canonicalizeUrl(rawJob.jobUrl || rawJob.applyUrl)
  const publishedAt = normalizeTimestamp(rawJob.publishedAt)

  return {
    source: "ashby",
    sourceJobId: normalizeSourceJobId(rawJob.id) || url,
    company:
      cleanText(boardConfig.company) ||
      titleCaseSlug(extractBoardSlug(boardConfig.board, "ashby")),
    title: cleanText(rawJob.title),
    description: combineText(
      rawJob.descriptionPlain,
      rawJob.department,
      rawJob.team,
    ),
    url,
    location,
    isRemote:
      rawJob.isRemote === true ||
      String(rawJob.workplaceType).toLowerCase() === "remote" ||
      inferRemote(location),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchAshbyJobs(
  boardConfig,
  { fetchImpl = fetch } = {},
) {
  const board = extractBoardSlug(boardConfig.board, "ashby")

  if (!board) {
    throw new Error("Ashby board configuration is missing `board`.")
  }

  const payload = await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
      board,
    )}`,
    { fetchImpl },
  )

  if (!Array.isArray(payload.jobs)) {
    throw new Error(`Ashby board ${board} returned an invalid payload.`)
  }

  return payload.jobs
    .filter((job) => job.isListed !== false)
    .map((job) => normalizeAshbyJob(job, boardConfig))
}
