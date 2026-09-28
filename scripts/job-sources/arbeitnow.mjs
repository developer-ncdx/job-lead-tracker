import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT = "https://www.arbeitnow.com/api/job-board-api"
const DEFAULT_PAGES = 3

export function normalizeArbeitnowJob(
  rawJob,
  { source = "arbeitnow" } = {},
) {
  const createdAt = normalizeTimestamp(rawJob.created_at)

  return {
    source,
    sourceJobId: normalizeSourceJobId(rawJob.slug || rawJob.url),
    company: cleanText(rawJob.company_name),
    title: cleanText(rawJob.title),
    description: cleanText(rawJob.description),
    url: canonicalizeUrl(rawJob.url),
    location: cleanText(rawJob.location),
    isRemote:
      rawJob.remote === true ||
      inferRemote(rawJob.location, rawJob.title, rawJob.tags),
    sourceTimestampAt: createdAt,
    sourceTimestampKind: createdAt ? "created" : null,
  }
}

export async function fetchArbeitnowJobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const jobs = []
  const pages = Math.max(1, Number(config.pages ?? DEFAULT_PAGES))

  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(config.endpoint ?? DEFAULT_ENDPOINT)
    url.searchParams.set("page", String(page))

    const payload = await fetchJson(url, {
      fetchImpl,
      headers: {
        accept: "application/json",
        "user-agent": "JobLeadTracker/1.0",
      },
    })

    if (!Array.isArray(payload.data)) {
      throw new Error("Arbeitnow returned an invalid jobs payload.")
    }

    jobs.push(
      ...payload.data.map((job) =>
        normalizeArbeitnowJob(job, { source: config.source }),
      ),
    )

    if (!payload.links?.next || payload.data.length === 0) {
      break
    }
  }

  return jobs
}
