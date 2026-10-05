import { parseHTML } from "linkedom"
import { matchesTargetRole } from "./role-filter.mjs"
import { isRemoteOnlyJob } from "./sync-utils.mjs"

const ORIGIN = "https://www.smileandhire.com"
const JOB_PATH = /^\/jobs\/((?:c-)?[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\/?$/i
const text = element => element?.textContent.replace(/\s+/g, " ").trim() || null

export function smileJobUrl(value) {
  try {
    const url = new URL(value, ORIGIN)
    if (url.origin !== ORIGIN || !JOB_PATH.test(url.pathname)) return null
    return `${ORIGIN}${url.pathname.replace(/\/$/, "")}`
  } catch {
    return null
  }
}

export function extractSmileListings(html, fetchedAt = new Date().toISOString()) {
  const { document } = parseHTML(html)
  const seen = new Set()
  const jobs = []
  for (const anchor of document.querySelectorAll("a[href]")) {
    const url = smileJobUrl(anchor.getAttribute("href"))
    if (!url || seen.has(url)) continue
    const heading = anchor.querySelector("h3")
    if (!text(heading)) throw new Error("Stopped: expected listing title is missing")
    const column = heading.parentElement
    const categoryRow = heading.previousElementSibling
    const metadata = heading.nextElementSibling
    const workStyle = metadata?.querySelector("svg.lucide-map-pin")?.closest("span")
    const hours = metadata?.querySelector("svg.lucide-clock-3")?.closest("span")
    const location = workStyle?.getAttribute("title") || text(workStyle)
    const metadataFields = [...(metadata?.children ?? [])].filter(element => element.tagName === "SPAN" && text(element) !== "·")
    const job = {
      source: "smileandhire-poc",
      sourceId: new URL(url).pathname.match(JOB_PATH)[1],
      url,
      title: text(heading),
      company: text(categoryRow?.children[1]),
      category: text(categoryRow?.children[0]),
      employmentType: text(metadataFields[0]),
      experienceLevel: text(metadataFields[1]),
      location,
      hoursPerWeek: hours?.getAttribute("title") || text(hours),
      salary: text(column.nextElementSibling?.querySelector("span")),
      description: text(column.querySelector("p")) || "",
      descriptionKind: "listing_overview",
      isRemote: /\bremote\b/i.test(location ?? ""),
      fetchedAt,
    }
    jobs.push({ ...job, matchesTargetRole: matchesTargetRole(job), isRemoteOnly: isRemoteOnlyJob(job) })
    seen.add(url)
  }
  if (!jobs.length) throw new Error("Stopped: no public job cards found; access or page layout may have changed")
  return jobs
}

export function extractSmileDetail(html, listing, fetchedAt = new Date().toISOString()) {
  const { document } = parseHTML(html)
  if (text(document.querySelector("h1")) !== listing.title) throw new Error("Stopped: detail title does not match the selected job")
  const headings = [...document.querySelectorAll("h2,h3")]
  const descriptionHeading = headings.find(heading => text(heading) === "Job Description")
  if (!descriptionHeading?.nextElementSibling || !text(descriptionHeading.nextElementSibling)) throw new Error("Stopped: expected public job description is missing")
  const parts = [...descriptionHeading.nextElementSibling.children].map(text).filter(Boolean)
  if (!parts.length) parts.push(text(descriptionHeading.nextElementSibling))
  for (const label of ["What You'll Do", "Requirements"]) {
    const section = headings.find(heading => text(heading) === label)?.nextElementSibling
    if (section) parts.push(`${label}\n${[...section.children].map(text).filter(Boolean).join("\n")}`)
  }
  const job = { ...listing, description: parts.join("\n\n"), descriptionKind: "job_detail", fetchedAt }
  return { ...job, isRemoteOnly: isRemoteOnlyJob(job) }
}
