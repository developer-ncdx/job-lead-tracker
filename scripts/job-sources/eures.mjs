import {
  canonicalizeUrl,
  cleanText,
  fetchJson,
  inferRemote,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_ENDPOINT =
  "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search"
const DEFAULT_QUERIES = Object.freeze([
  "software engineer",
  "software developer",
  "frontend developer",
  "backend developer",
  "AI engineer",
  "automation engineer",
])
const DEFAULT_PAGE_SIZE = 50

function getTranslatedField(rawJob, field) {
  return (
    rawJob.translations?.en?.[field] ||
    rawJob.translation?.[field] ||
    rawJob[field]
  )
}

export function normalizeEuresJob(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.creationDate)
  const title = cleanText(getTranslatedField(rawJob, "title"))
  const description = cleanText(getTranslatedField(rawJob, "description"))
  const location = Object.keys(rawJob.locationMap ?? {})
    .map((country) => country.toUpperCase())
    .join(", ")

  return {
    source: "eures",
    sourceJobId: normalizeSourceJobId(rawJob.id),
    company: cleanText(rawJob.employer?.name),
    title,
    description,
    url: canonicalizeUrl(
      `https://europa.eu/eures/portal/jv-se/jv-details/${encodeURIComponent(
        rawJob.id,
      )}?lang=en`,
    ),
    location,
    isRemote: inferRemote(location, title, description),
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "created" : null,
  }
}

function buildSearchBody(config, query, page, pageSize) {
  return {
    resultsPerPage: pageSize,
    page,
    sortSearch: "MOST_RECENT",
    keywords: [
      {
        keyword: query,
        specificSearchCode: config.searchCode ?? "TITLE",
      },
    ],
    publicationPeriod: config.publicationPeriod ?? null,
    occupationUris: [],
    skillUris: [],
    requiredExperienceCodes: [],
    positionScheduleCodes: [],
    sectorCodes: [],
    educationAndQualificationLevelCodes: [],
    positionOfferingCodes: [],
    locationCodes: config.locationCodes ?? [],
    euresFlagCodes: [],
    otherBenefitsCodes: [],
    requiredLanguages: [],
    minNumberPost: null,
    sessionId: `job-lead-tracker-${query.replace(/\W+/g, "-")}`,
    requestLanguage: "en",
  }
}

export async function fetchEuresJobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const jobsById = new Map()
  const queries =
    Array.isArray(config.queries) && config.queries.length > 0
      ? config.queries
      : DEFAULT_QUERIES
  const pages = Math.max(1, Number(config.pages ?? 1))
  const pageSize = Math.max(
    1,
    Number(config.pageSize ?? DEFAULT_PAGE_SIZE),
  )

  for (const query of queries) {
    for (let page = 1; page <= pages; page += 1) {
      const payload = await fetchJson(
        config.endpoint ?? DEFAULT_ENDPOINT,
        {
          fetchImpl,
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "user-agent": "JobLeadTracker/1.0",
          },
          body: JSON.stringify(
            buildSearchBody(config, query, page, pageSize),
          ),
        },
      )

      if (!Array.isArray(payload.jvs)) {
        throw new Error("EURES returned an invalid jobs payload.")
      }

      for (const rawJob of payload.jvs) {
        const job = normalizeEuresJob(rawJob)
        jobsById.set(job.sourceJobId, job)
      }

      const total = Number(payload.numberRecords)
      if (
        payload.jvs.length === 0 ||
        (Number.isFinite(total) && page * pageSize >= total)
      ) {
        break
      }
    }
  }

  return [...jobsById.values()]
}
