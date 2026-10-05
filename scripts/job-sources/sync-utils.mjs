import { canonicalizeUrl } from "./shared.mjs"

const NON_REMOTE_WORKPLACE_PATTERNS = Object.freeze([
  /\bhybrid\b/i,
  /\bon[\s-]?site\b/i,
  /\bin[\s-]?office\b/i,
  /\boffice[\s-]?based\b/i,
  /\b(?:mostly|partly|partially)\s+remote\b/i,
  /\bremote\s+(?:option|eligible|possible)\b/i,
  /\bworksite\s*:\s*(?:hybrid|on[\s-]?site)/i,
  /\b(?:Hybrid|On[\s-]?site)(?=[A-Z])/,
])

const SOURCE_PRIORITY = Object.freeze({
  greenhouse: 1,
  ashby: 1,
  lever: 1,
  smartrecruiters: 1,
  workable: 1,
  personio: 1,
  weworkremotely: 2,
  remotive: 2,
  remoteok: 2,
  jobicy: 2,
  himalayas: 2,
  arbeitnow: 2,
  arbeitnowuk: 2,
  themuse: 2,
  jobtech: 2,
  eures: 2,
  ayla: 2,
  nomado24: 3,
  jooble: 2,
  "linkedin-email": 2,
  "indeed-email": 2,
  "onlinejobsph-email": 2,
  onlinejobsph: 2,
  smileandhire: 2,
  "upwork-email": 2,
})

export function jobIdentity(job) {
  return `${job.source}:${job.sourceJobId}`
}

export function isRemoteOnlyJob(job) {
  if (job.isRemote !== true) {
    return false
  }

  const workplaceText = [job.title, job.location, job.description]
    .filter(Boolean)
    .join(" ")

  return !NON_REMOTE_WORKPLACE_PATTERNS.some((pattern) =>
    pattern.test(workplaceText),
  )
}

function normalizeFingerprintPart(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .trim()
}

export function jobFingerprint(job) {
  const title = normalizeFingerprintPart(job.title)
  const company = normalizeFingerprintPart(job.company)

  if (!title || !company) {
    return ""
  }

  return [
    title,
    company,
    normalizeFingerprintPart(job.location),
  ].join("|")
}

export function deduplicateJobs(jobs) {
  const orderedJobs = [...jobs].sort(
    (left, right) =>
      (SOURCE_PRIORITY[left.source] ?? 10) -
      (SOURCE_PRIORITY[right.source] ?? 10),
  )
  const seenIdentities = new Set()
  const seenUrls = new Set()
  const seenFingerprints = new Set()
  const uniqueJobs = []

  for (const job of orderedJobs) {
    // Email and web links can have different slugs for the same numeric job ID.
    const identity = ["onlinejobsph", "onlinejobsph-email"].includes(job.source)
      ? `onlinejobsph:${job.sourceJobId}`
      : jobIdentity(job)
    const canonicalUrl = canonicalizeUrl(job.url)
    const fingerprint = jobFingerprint(job)

    if (
      !job.source ||
      !job.sourceJobId ||
      !job.title ||
      !canonicalUrl ||
      seenIdentities.has(identity) ||
      seenUrls.has(canonicalUrl) ||
      (fingerprint && seenFingerprints.has(fingerprint))
    ) {
      continue
    }

    seenIdentities.add(identity)
    seenUrls.add(canonicalUrl)
    if (fingerprint) {
      seenFingerprints.add(fingerprint)
    }
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
      source: existing?.source ?? job.source,
      source_job_id: existing?.source_job_id ?? job.sourceJobId,
      title: existing?.title ?? job.title,
      description: existing?.description ?? job.description ?? "",
      url: existing?.url ?? job.url,
      company: job.company || null,
      location: job.location || null,
      is_remote: job.isRemote,
      source_timestamp_at:
        job.sourceTimestampAt ?? existing?.source_timestamp_at ?? null,
      source_timestamp_kind:
        job.sourceTimestampKind ?? existing?.source_timestamp_kind ?? null,
      source_timestamp_label: job.sourceTimestampAt
        ? null
        : job.sourceTimestampLabel ?? existing?.source_timestamp_label ?? null,
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
