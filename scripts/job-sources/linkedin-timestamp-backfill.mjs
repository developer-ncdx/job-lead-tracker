import {
  extractExactPostedAt,
  extractProviderPostedLabel,
} from "./email-alerts.mjs"

const LINKEDIN_SOURCE = "linkedin-email"

function postingUrl(row) {
  const sourceJobId = String(row.source_job_id ?? "").trim()

  return /^\d+$/.test(sourceJobId)
    ? `https://www.linkedin.com/jobs/view/${sourceJobId}`
    : row.url
}

async function fetchPostingMetadata(row, fetchImpl) {
  const response = await fetchImpl(postingUrl(row), {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "curl/8.7.1",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const html = await response.text()
  const sourceTimestampAt = extractExactPostedAt(html)

  if (sourceTimestampAt) {
    return {
      source_timestamp_at: sourceTimestampAt,
      source_timestamp_kind: "published",
      source_timestamp_label: null,
    }
  }

  const sourceTimestampLabel = extractProviderPostedLabel(html)

  return sourceTimestampLabel
    ? {
        source_timestamp_at: null,
        source_timestamp_kind: null,
        source_timestamp_label: sourceTimestampLabel,
      }
    : null
}

export async function backfillLinkedInTimestamps(
  client,
  { fetchImpl = fetch, limit = 50 } = {},
) {
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 50))
  const { data, error } = await client
    .from("job_leads")
    .select("id,url,source_job_id")
    .eq("source", LINKEDIN_SOURCE)
    .is("source_timestamp_at", null)
    .is("source_timestamp_label", null)
    .limit(normalizedLimit)

  if (error) {
    throw new Error(
      `Could not load LinkedIn timestamp backfill rows: ${error.message}`,
    )
  }

  const rows = data ?? []
  let updated = 0
  let unresolved = 0
  const failures = []

  for (let index = 0; index < rows.length; index += 3) {
    const batch = rows.slice(index, index + 3)

    await Promise.all(
      batch.map(async (row) => {
        try {
          const metadata = await fetchPostingMetadata(row, fetchImpl)

          if (!metadata) {
            unresolved += 1
            return
          }

          const result = await client
            .from("job_leads")
            .update(metadata)
            .eq("id", row.id)

          if (result.error) {
            throw new Error(result.error.message)
          }

          updated += 1
        } catch (backfillError) {
          failures.push({
            sourceJobId: row.source_job_id,
            error:
              backfillError instanceof Error
                ? backfillError.message
                : String(backfillError),
          })
        }
      }),
    )
  }

  return {
    attempted: rows.length,
    updated,
    unresolved,
    failures,
  }
}
