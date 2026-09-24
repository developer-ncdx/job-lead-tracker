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

export function normalizeLeverJob(rawJob, boardConfig) {
  const listContent = Array.isArray(rawJob.lists)
    ? rawJob.lists.flatMap((list) => [list?.text, list?.content])
    : []
  const location = cleanText(
    rawJob.categories?.allLocations?.join(" | ") ||
      rawJob.categories?.location,
  )
  const createdAt = normalizeTimestamp(rawJob.createdAt)

  return {
    source: "lever",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company:
      cleanText(boardConfig.company) ||
      titleCaseSlug(extractBoardSlug(boardConfig.board, "lever")),
    title: cleanText(rawJob.text),
    description: combineText(
      rawJob.descriptionPlain,
      rawJob.openingPlain,
      rawJob.descriptionBodyPlain,
      ...listContent,
      rawJob.additionalPlain,
    ),
    url: canonicalizeUrl(rawJob.hostedUrl || rawJob.applyUrl),
    location,
    isRemote:
      String(rawJob.workplaceType).toLowerCase() === "remote" ||
      inferRemote(location, rawJob.categories?.commitment),
    sourceTimestampAt: createdAt,
    sourceTimestampKind: createdAt ? "created" : null,
  }
}

export async function fetchLeverJobs(
  boardConfig,
  { fetchImpl = fetch } = {},
) {
  const board = extractBoardSlug(boardConfig.board, "lever")

  if (!board) {
    throw new Error("Lever board configuration is missing `board`.")
  }

  const host =
    String(boardConfig.region).toLowerCase() === "eu"
      ? "api.eu.lever.co"
      : "api.lever.co"
  const payload = await fetchJson(
    `https://${host}/v0/postings/${encodeURIComponent(board)}?mode=json`,
    { fetchImpl },
  )

  if (!Array.isArray(payload)) {
    throw new Error(`Lever board ${board} returned an invalid payload.`)
  }

  return payload.map((job) => normalizeLeverJob(job, boardConfig))
}
