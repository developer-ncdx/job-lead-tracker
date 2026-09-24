import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT =
  "https://remotive.com/api/remote-jobs?category=software-dev"

export function normalizeRemotiveJob(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.publication_date)

  return {
    source: "remotive",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company: cleanText(rawJob.company_name),
    title: cleanText(rawJob.title),
    description: cleanText(rawJob.description),
    url: canonicalizeUrl(rawJob.url),
    location: cleanText(rawJob.candidate_required_location),
    isRemote: true,
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchRemotiveJobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const payload = await fetchJson(config.endpoint ?? DEFAULT_ENDPOINT, {
    fetchImpl,
    headers: {
      accept: "application/json",
      "user-agent": "JobLeadTracker/1.0",
    },
  })

  if (!Array.isArray(payload.jobs)) {
    throw new Error("Remotive returned an invalid jobs payload.")
  }

  return payload.jobs.map(normalizeRemotiveJob)
}
