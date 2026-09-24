import { canonicalizeUrl } from "./shared.mjs"

const SOURCE_PRIORITY = Object.freeze({
  greenhouse: 1,
  ashby: 1,
  lever: 1,
  weworkremotely: 2,
  remotive: 2,
  remoteok: 2,
  jobicy: 2,
  himalayas: 2,
  jooble: 2,
})

export function jobIdentity(job) {
  return `${job.source}:${job.sourceJobId}`
}

export function deduplicateJobs(jobs) {
  const orderedJobs = [...jobs].sort(
    (left, right) =>
      (SOURCE_PRIORITY[left.source] ?? 10) -
      (SOURCE_PRIORITY[right.source] ?? 10),
  )
  const seenIdentities = new Set()
  const seenUrls = new Set()
  const uniqueJobs = []

  for (const job of orderedJobs) {
    const identity = jobIdentity(job)
    const canonicalUrl = canonicalizeUrl(job.url)

    if (
      !job.source ||
      !job.sourceJobId ||
      !job.title ||
      !canonicalUrl ||
      seenIdentities.has(identity) ||
      seenUrls.has(canonicalUrl)
    ) {
      continue
    }

    seenIdentities.add(identity)
    seenUrls.add(canonicalUrl)
    uniqueJobs.push({
      ...job,
      url: canonicalUrl,
    })
  }

  return uniqueJobs
}

export function buildSupabaseRows(
  jobs,
  userId,
  {
    existingByIdentity = new Map(),
    observedAt = new Date().toISOString(),
  } = {},
) {
  return jobs.map((job) => {
    const existing = existingByIdentity.get(jobIdentity(job))

    return {
      user_id: userId,
      source: job.source,
      source_job_id: job.sourceJobId,
      title: existing?.title ?? job.title,
      description: existing?.description ?? job.description ?? "",
      url: existing?.url ?? job.url,
      company: job.company || null,
      location: job.location || null,
      is_remote: job.isRemote,
      source_timestamp_at: job.sourceTimestampAt,
      source_timestamp_kind: job.sourceTimestampKind,
      first_seen_at: existing?.first_seen_at ?? observedAt,
      last_seen_at: observedAt,
    }
  })
}

export function chunk(values, size = 100) {
  const chunks = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}
