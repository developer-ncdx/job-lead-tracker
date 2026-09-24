import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://remoteok.com/api?tag=dev"

export function normalizeRemoteOkJob(rawJob) {
  const publishedAt =
    normalizeTimestamp(rawJob.date) ?? normalizeTimestamp(rawJob.epoch)

  return {
    source: "remoteok",
    sourceJobId: normalizeSourceJobId(rawJob.id || rawJob.slug),
    company: cleanText(rawJob.company),
    title: cleanText(rawJob.position),
    description: cleanText(rawJob.description),
    url: canonicalizeUrl(rawJob.url || rawJob.apply_url),
    location: cleanText(rawJob.location),
    isRemote: true,
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchRemoteOkJobs(
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

  if (!Array.isArray(payload)) {
    throw new Error("Remote OK returned an invalid jobs payload.")
  }

  return payload
    .filter((job) => job && (job.id || job.slug) && job.position)
    .map(normalizeRemoteOkJob)
}
