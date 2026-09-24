import { parseRssItems, rssValue } from "./rss.mjs"
import {
  canonicalizeUrl,
  cleanText,
  fetchText,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_FEED = "https://jobicy.com/jobs/feed?industry=engineering"

export function normalizeJobicyJob(rawJob) {
  const publishedAt = normalizeTimestamp(rawJob.pubDate)
  const url = canonicalizeUrl(rssValue(rawJob.link) || rssValue(rawJob.guid))

  return {
    source: "jobicy",
    sourceJobId: normalizeSourceJobId(
      rssValue(rawJob.id) || rssValue(rawJob.guid) || url,
    ),
    company: cleanText(rawJob["job_listing:company"]),
    title: cleanText(rawJob.title),
    description: cleanText(
      rawJob["content:encoded"] || rawJob.description,
    ),
    url,
    location: cleanText(rawJob["job_listing:location"]),
    isRemote: true,
    sourceTimestampAt: publishedAt,
    sourceTimestampKind: publishedAt ? "published" : null,
  }
}

export async function fetchJobicyJobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const xml = await fetchText(config.feed ?? DEFAULT_FEED, {
    fetchImpl,
    headers: { "user-agent": "JobLeadTracker/1.0" },
  })

  return parseRssItems(xml).map(normalizeJobicyJob)
}
