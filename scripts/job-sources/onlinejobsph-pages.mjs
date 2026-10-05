import { brotliDecompressSync } from "node:zlib"
import { parseHTML } from "linkedom"

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
  const { document } = parseHTML(html)
  return [...new Set([...document.querySelectorAll("a[href]")].map(a => {
    try { return jobUrl(a.getAttribute("href")) } catch { return null }
  }).filter(Boolean))]
}

export function extractJob(html, url) {
  const { document } = parseHTML(html)
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
