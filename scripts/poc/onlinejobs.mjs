import { writeFile } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { brotliDecompressSync } from "node:zlib"
import { JSDOM } from "jsdom"

const ORIGIN = "https://www.onlinejobs.ph"

export function decodeHtml(bytes) {
  let html = Buffer.from(bytes).toString("utf8")
  // Some responses arrive as Brotli bytes without Content-Encoding metadata.
  // Normal fetch responses are already decoded and take the first branch.
  if (!/^\s*(?:<!doctype html|<html)/i.test(html)) {
    try {
      html = brotliDecompressSync(Buffer.from(bytes), {
        maxOutputLength: 5 * 1024 * 1024,
      }).toString("utf8")
    } catch {
      throw new Error("Stopped: response is neither HTML nor Brotli-compressed HTML")
    }
  }
  if (!/^\s*(?:<!doctype html|<html)/i.test(html)) {
    throw new Error("Stopped: non-HTML response")
  }
  return html
}

export function jobUrl(value) {
  const url = new URL(value, ORIGIN)
  if (url.origin !== ORIGIN || !/^\/jobseekers\/job\/[^/]+-\d+\/?$/.test(url.pathname)) return null
  return `${ORIGIN}${url.pathname.replace(/\/$/, "")}`
}

export function extractJobLinks(html) {
  const document = new JSDOM(html).window.document
  return [...new Set([...document.querySelectorAll("a[href]")].map(a => {
    try { return jobUrl(a.getAttribute("href")) } catch { return null }
  }).filter(Boolean))]
}

export function extractJob(html, url) {
  const document = new JSDOM(html).window.document
  document.querySelectorAll("script, style, nav, footer").forEach(el => el.remove())
  const text = document.body.textContent.replace(/\s+/g, " ").trim()
  const title = document.querySelector("h1")?.textContent.trim()
  const field = (start, end) => text.match(new RegExp(`${start}\\s*([\\s\\S]*?)(?=${end})`, "i"))?.[1].trim() || null
  const description = field("JOB OVERVIEW", "SKILL REQUIREMENT|ABOUT THE EMPLOYER|SHARE THIS POST|Bookmark Note:")
  if (!title || !description) throw new Error("Expected job content missing; page layout may have changed or access was challenged")
  return {
    source: "onlinejobsph-poc", sourceId: url.match(/-(\d+)$/)?.[1], url, title,
    employmentType: field("TYPE OF WORK", "WAGE / SALARY"),
    salary: field("WAGE / SALARY", "HOURS PER WEEK"),
    hoursPerWeek: field("HOURS PER WEEK", "DATE UPDATED"),
    dateUpdated: field("DATE UPDATED", "JOB OVERVIEW"),
    description, fetchedAt: new Date().toISOString(),
  }
}

export async function crawl({ searchUrl, limit = 3, fetchImpl = fetch, wait = delay, seenIds = new Set(), onSkipped = () => {} }) {
  const search = new URL(searchUrl)
  if (search.origin !== ORIGIN || search.pathname !== "/jobseekers/jobsearch") throw new Error("Only the public OnlineJobs.ph jobsearch URL is supported")
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error("Limit must be between 1 and 3")
  const read = async url => {
    const response = await fetchImpl(url, {
      redirect: "error", signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "JobLeadTracker-POC/0.1", Accept: "text/html" },
    })
    if (!response.ok) throw Object.assign(new Error(`Stopped: HTTP ${response.status} from ${url}; no retry or bypass attempted`), { status: response.status })
    return decodeHtml(await response.arrayBuffer())
  }
  const allLinks = extractJobLinks(await read(search.href))
  if (!allLinks.length) throw new Error("No public job links found; access or layout may have changed")
  const selectedIds = new Set(seenIds)
  const links = allLinks.filter(url => {
    const id = url.match(/-(\d+)$/)?.[1]
    if (selectedIds.has(id)) return false
    selectedIds.add(id)
    return true
  }).slice(0, limit)
  const jobs = []
  for (const url of links) {
    await wait(5_000)
    try {
      jobs.push(extractJob(await read(url), url))
    } catch (error) {
      if (error.status !== 410) throw error
      onSkipped({ url, status: 410, reason: "gone" })
    }
  }
  return jobs
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2)
    const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
    const search = new URL("/jobseekers/jobsearch", ORIGIN)
    if (option("keyword")) search.searchParams.set("jobkeyword", option("keyword"))
    const jobs = await crawl({ searchUrl: search.href, limit: Number(option("limit") || 3) })
    const output = option("output") || "/tmp/onlinejobs-poc.json"
    await writeFile(output, `${JSON.stringify({ searchUrl: search.href, jobs }, null, 2)}\n`)
    console.log(`Extracted ${jobs.length} jobs to ${output}; no database writes`)
    for (const job of jobs) console.log(`${job.title} | ${job.salary || "salary unavailable"} | ${job.url}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
