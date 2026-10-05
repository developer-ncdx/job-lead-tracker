import { setTimeout as delay } from "node:timers/promises"
import { decodeHtml } from "./onlinejobsph-pages.mjs"

export function createCrawlReader({ fetchImpl = fetch, wait = delay, now = () => new Date() } = {}) {
  let hasRequested = false
  return async url => {
    if (hasRequested) await wait(5_000)
    hasRequested = true
    const response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "JobLeadTracker/1.0", Accept: "text/html" },
    })
    if (!response.ok) {
      const error = Object.assign(new Error(`HTTP ${response.status}; crawl stopped without retry`), { status: response.status })
      if ([401, 403, 429].includes(response.status)) {
        const retryAfter = response.headers.get("retry-after")
        const delayMs = /^\d+$/.test(retryAfter ?? "") ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now().getTime()
        const fallbackMs = response.status === 429 ? 60 * 60_000 : 24 * 60 * 60_000
        error.cooldownUntil = new Date(now().getTime() + (delayMs > 0 ? delayMs : fallbackMs)).toISOString()
      }
      throw error
    }
    return decodeHtml(await response.arrayBuffer())
  }
}

export function cachedJob(cache, id, observedAt, refreshHours = 24) {
  const entry = cache[id]
  if (!entry) return { fresh: false }
  entry.seenAt = observedAt
  return {
    fresh: Date.parse(entry.checkedAt) > Date.parse(observedAt) - refreshHours * 60 * 60_000,
    job: entry.job,
  }
}
