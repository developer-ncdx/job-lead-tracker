import { XMLParser } from "fast-xml-parser"

import {
  canonicalizeUrl,
  cleanText,
  extractBoardSlug,
  fetchText,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
})

function extractDescription(rawJob) {
  const sections = rawJob.jobDescriptions?.jobDescription

  if (!sections) {
    return ""
  }

  const values = Array.isArray(sections) ? sections : [sections]
  return values
    .flatMap((section) => [section?.name, section?.value])
    .map(cleanText)
    .filter(Boolean)
    .join("\n\n")
}

export function normalizePersonioJob(rawJob, boardConfig) {
  const board = extractBoardSlug(boardConfig.board, "personio")
  const createdAt = normalizeTimestamp(rawJob.createdAt)
  const description = extractDescription(rawJob)
  const location = cleanText(rawJob.office)

  return {
    source: "personio",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company: cleanText(
      rawJob.subcompany || boardConfig.company || board,
    ),
    title: cleanText(rawJob.name),
    description,
    url: canonicalizeUrl(
      `https://${board}.jobs.personio.de/job/${encodeURIComponent(
        rawJob.id,
      )}?language=en`,
    ),
    location,
    isRemote: inferRemote(
      location,
      rawJob.name,
      rawJob.keywords,
    ),
    sourceTimestampAt: createdAt,
    sourceTimestampKind: createdAt ? "created" : null,
  }
}

export async function fetchPersonioJobs(
  boardConfig,
  { fetchImpl = fetch } = {},
) {
  const board = extractBoardSlug(boardConfig.board, "personio")

  if (!board) {
    throw new Error("Personio board configuration is missing `board`.")
  }

  const xml = await fetchText(
    `https://${board}.jobs.personio.de/xml?language=${
      boardConfig.language ?? "en"
    }`,
    {
      fetchImpl,
      headers: { "user-agent": "JobLeadTracker/1.0" },
    },
  )
  const positions = parser.parse(xml)?.["workzag-jobs"]?.position

  if (!positions) {
    return []
  }

  const jobs = Array.isArray(positions) ? positions : [positions]
  return jobs.map((job) => normalizePersonioJob(job, boardConfig))
}
