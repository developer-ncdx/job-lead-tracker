import { parseRssItems, rssValue } from "./rss.mjs"
import {
  canonicalizeUrl,
  cleanText,
  fetchText,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

const DEFAULT_FEED =
  "https://weworkremotely.com/categories/remote-programming-jobs.rss"

function splitListingTitle(value) {
  const title = cleanText(value)
  const separatorIndex = title.indexOf(":")

  if (separatorIndex < 1) {
    return { company: "", title }
  }

  return {
    company: title.slice(0, separatorIndex).trim(),
    title: title.slice(separatorIndex + 1).trim(),
  }
}

export function normalizeWeWorkRemotelyJob(rawJob) {
  const listing = splitListingTitle(rawJob.title)
  const url = canonicalizeUrl(rssValue(rawJob.link) || rssValue(rawJob.guid))

  return {
    source: "weworkremotely",
    sourceJobId: normalizeSourceJobId(rssValue(rawJob.guid) || url),
    company: listing.company,
    title: listing.title,
    description: cleanText(rawJob.description),
    url,
    location: cleanText(rawJob.region),
    isRemote: true,
    sourceTimestampAt: normalizeTimestamp(rawJob.pubDate),
    sourceTimestampKind: normalizeTimestamp(rawJob.pubDate)
      ? "published"
      : null,
  }
}

export async function fetchWeWorkRemotelyJobs(
  config = {},
  { fetchImpl = fetch } = {},
) {
  const xml = await fetchText(config.feed ?? DEFAULT_FEED, {
    fetchImpl,
    headers: { "user-agent": "JobLeadTracker/1.0" },
  })

  return parseRssItems(xml).map(normalizeWeWorkRemotelyJob)
}
