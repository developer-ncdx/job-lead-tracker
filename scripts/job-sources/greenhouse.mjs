import {
  canonicalizeUrl,
  cleanText,
  extractBoardSlug,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
  titleCaseSlug,
} from "./shared.mjs"

export function normalizeGreenhouseJob(rawJob, boardConfig) {
  const publishedAt = normalizeTimestamp(rawJob.first_published)
  const updatedAt = normalizeTimestamp(rawJob.updated_at)
  const sourceTimestampAt = publishedAt ?? updatedAt

  return {
    source: "greenhouse",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company:
      cleanText(rawJob.company_name) ||
      cleanText(boardConfig.company) ||
      titleCaseSlug(extractBoardSlug(boardConfig.board, "greenhouse")),
    title: cleanText(rawJob.title),
    description: cleanText(rawJob.content),
    url: canonicalizeUrl(rawJob.absolute_url),
    location: cleanText(rawJob.location?.name),
    isRemote: inferRemote(
      rawJob.location?.name,
      rawJob.title,
      rawJob.content,
    ),
    sourceTimestampAt,
    sourceTimestampKind: publishedAt
      ? "published"
      : updatedAt
        ? "updated"
        : null,
  }
}

export async function fetchGreenhouseJobs(
  boardConfig,
  { fetchImpl = fetch } = {},
) {
  const board = extractBoardSlug(boardConfig.board, "greenhouse")

  if (!board) {
    throw new Error("Greenhouse board configuration is missing `board`.")
  }

  const payload = await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
      board,
    )}/jobs?content=true`,
    { fetchImpl },
  )

  if (!Array.isArray(payload.jobs)) {
    throw new Error(`Greenhouse board ${board} returned an invalid payload.`)
  }

  return payload.jobs.map((job) =>
    normalizeGreenhouseJob(job, boardConfig),
  )
}
