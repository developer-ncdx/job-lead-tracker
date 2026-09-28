import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

export function normalizeJoobleJob(rawJob) {
  const location = cleanText(rawJob.location)
  const updatedAt = normalizeTimestamp(rawJob.updated)

  return {
    source: "jooble",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company: cleanText(rawJob.company) || cleanText(rawJob.source),
    title: cleanText(rawJob.title),
    description: cleanText(rawJob.snippet),
    url: canonicalizeUrl(rawJob.link),
    location,
    isRemote: inferRemote(
      location,
      rawJob.type,
      rawJob.title,
    ),
    sourceTimestampAt: updatedAt,
    sourceTimestampKind: updatedAt ? "updated" : null,
  }
}

export async function fetchJoobleJobs(
  joobleConfig,
  { apiKey, fetchImpl = fetch } = {},
) {
  if (!apiKey) {
    throw new Error("JOOBLE_API_KEY is not configured.")
  }

  const queries = Array.isArray(joobleConfig.queries)
    ? joobleConfig.queries.filter(Boolean)
    : []
  const locations =
    Array.isArray(joobleConfig.locations) &&
    joobleConfig.locations.length > 0
      ? joobleConfig.locations
      : [""]
  const pages = Math.max(1, Number(joobleConfig.pages) || 1)
  const jobsById = new Map()

  for (const keywords of queries) {
    for (const location of locations) {
      for (let page = 1; page <= pages; page += 1) {
        const payload = await fetchJson(
          `https://jooble.org/api/${encodeURIComponent(apiKey)}`,
          {
            fetchImpl,
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              keywords,
              location,
              page,
              companysearch: "false",
            }),
          },
        )

        if (!Array.isArray(payload.jobs)) {
          throw new Error("Jooble returned an invalid payload.")
        }

        for (const rawJob of payload.jobs) {
          const job = normalizeJoobleJob(rawJob)
          jobsById.set(job.sourceJobId, job)
        }

        if (payload.jobs.length === 0) {
          break
        }
      }
    }
  }

  return [...jobsById.values()]
}
