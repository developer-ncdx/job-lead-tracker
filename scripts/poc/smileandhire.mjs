import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { brotliDecompressSync, gunzipSync } from "node:zlib"
import { JSDOM } from "jsdom"
import { createClient } from "@supabase/supabase-js"
import { loadLocalEnvironment } from "../job-sources/config.mjs"
import { matchesTargetRole } from "../job-sources/role-filter.mjs"
import { buildSupabaseRows, isRemoteOnlyJob } from "../job-sources/sync-utils.mjs"
import { decodeHtml } from "./onlinejobs.mjs"

const ORIGIN = "https://www.smileandhire.com"
const JOB_PATH = /^\/jobs\/((?:c-)?[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\/?$/i
const text = element => element?.textContent.replace(/\s+/g, " ").trim() || null

export async function fetchSupabaseJson(input, init, fetchImpl = fetch) {
  const response = await fetchImpl(input, init)
  if (!response.body) return response
  const bytes = Buffer.from(await response.clone().arrayBuffer())
  const firstCharacter = bytes.toString("utf8").trimStart()[0]
  if (!bytes.length || firstCharacter === "[" || firstCharacter === "{") return response
  let decoded
  try {
    // Some local responses lose encoding headers, leaving compressed JSON.
    decoded = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes, { maxOutputLength: 5 * 1024 * 1024 })
      : brotliDecompressSync(bytes, { maxOutputLength: 5 * 1024 * 1024 })
    JSON.parse(decoded.toString("utf8"))
  } catch {
    return response
  }
  const headers = new Headers(response.headers)
  headers.delete("content-encoding")
  headers.delete("content-length")
  return new Response(decoded, { status: response.status, statusText: response.statusText, headers })
}

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
  const document = new JSDOM(html).window.document
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
  const document = new JSDOM(html).window.document
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

export async function crawlSmile({ limit = 1, fetchImpl = fetch, wait = delay } = {}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 3) throw new Error("Detail limit must be between 0 and 3")
  const read = async url => {
    const response = await fetchImpl(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "JobLeadTracker-POC/0.1", Accept: "text/html" },
    })
    if (!response.ok) throw new Error(`Stopped: HTTP ${response.status} from ${url}; no retry attempted`)
    return decodeHtml(await response.arrayBuffer())
  }
  const jobs = extractSmileListings(await read(`${ORIGIN}/jobs`))
  // Inspect matching roles first; sample other public details when none match.
  const selected = [...jobs].sort((a, b) => Number(b.matchesTargetRole) - Number(a.matchesTargetRole)).slice(0, limit)
  for (const listing of selected) {
    await wait(5_000)
    const detailed = extractSmileDetail(await read(listing.url), listing)
    jobs[jobs.indexOf(listing)] = detailed
  }
  return {
    sourceUrl: `${ORIGIN}/jobs`,
    fetchedAt: new Date().toISOString(),
    detailPagesFetched: selected.length,
    jobs,
    eligibleJobIds: jobs.filter(job => job.matchesTargetRole && job.isRemoteOnly).map(job => job.sourceId),
  }
}

export async function importSmileJobs(savedJobs, { environment = process.env, clientFactory = createClient } = {}) {
  const seen = new Set()
  const jobs = []
  for (const saved of savedJobs) {
    const url = smileJobUrl(saved.url)
    if (!url || new URL(url).pathname.match(JOB_PATH)[1] !== saved.sourceId || !saved.title?.trim() || typeof saved.description !== "string") throw new Error("Invalid saved Smile & Hire job")
    const job = {
      ...saved,
      url,
      source: "smileandhire",
      sourceJobId: saved.sourceId,
      description: [
        saved.description,
        saved.salary && `Compensation: ${saved.salary}`,
        saved.employmentType && `Employment type: ${saved.employmentType}`,
        saved.hoursPerWeek && `Hours per week: ${saved.hoursPerWeek}`,
      ].filter(Boolean).join("\n\n"),
    }
    if (!matchesTargetRole(job) || !isRemoteOnlyJob(job) || seen.has(job.sourceJobId)) continue
    seen.add(job.sourceJobId)
    jobs.push(job)
  }
  if (!jobs.length) return { eligible: 0, imported: [], existing: 0 }
  const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL
  const key = environment.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --import")
  const owner = environment.JOB_LEADS_OWNER_ID?.trim()
  const ownerId = owner && owner !== "00000000-0000-0000-0000-000000000000" ? owner : null
  const client = clientFactory(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchSupabaseJson },
  })
  const existingIds = new Set()
  for (let offset = 0; ; offset += 500) {
    let query = client.from("job_leads").select("source,source_job_id,url")
      .or("source.eq.smileandhire,url.ilike.%smileandhire.com/jobs/%")
      .order("id").range(offset, offset + 499)
    query = ownerId ? query.eq("user_id", ownerId) : query.is("user_id", null)
    const { data, error } = await query
    if (error) throw new Error(`Could not check existing Smile & Hire jobs: ${error.message}`)
    for (const lead of data) {
      if (lead.source === "smileandhire" && lead.source_job_id) existingIds.add(lead.source_job_id)
      const id = smileJobUrl(lead.url) && new URL(lead.url).pathname.match(JOB_PATH)?.[1]
      if (id) existingIds.add(id)
    }
    if (data.length < 500) break
  }
  const newJobs = jobs.filter(job => !existingIds.has(job.sourceJobId))
  if (!newJobs.length) return { eligible: jobs.length, imported: [], existing: jobs.length }
  const { data, error } = await client.from("job_leads")
    .upsert(buildSupabaseRows(newJobs, ownerId), { onConflict: "user_id,source,source_job_id", ignoreDuplicates: true })
    .select("id,source_job_id,title,url")
  if (error) {
    // A failed response can follow a committed write. Verify it without retrying.
    let verification = client.from("job_leads").select("id,source_job_id,title,url")
      .eq("source", "smileandhire").in("source_job_id", newJobs.map(job => job.sourceJobId))
    verification = ownerId ? verification.eq("user_id", ownerId) : verification.is("user_id", null)
    const verified = await verification
    if (!verified.error && newJobs.every(job => verified.data.some(lead => lead.source_job_id === job.sourceJobId && lead.title === job.title && lead.url === job.url))) {
      return { eligible: jobs.length, imported: verified.data, existing: jobs.length - newJobs.length, verifiedAfterResponseError: true }
    }
    throw new Error("Could not confirm the Smile & Hire import after a failed database response; no write retry attempted")
  }
  return { eligible: jobs.length, imported: data, existing: jobs.length - newJobs.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
    if (option("input")) {
      if (!process.argv.includes("--import")) throw new Error("--input requires --import to import a saved crawl without fetching pages")
      loadLocalEnvironment()
      const saved = JSON.parse(await readFile(option("input"), "utf8"))
      console.log(JSON.stringify(await importSmileJobs(saved.jobs), null, 2))
    } else {
      const result = await crawlSmile({ limit: Number(option("limit") ?? 1) })
      const output = option("output") || "smileandhire-poc.local/results.json"
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
      console.log(`Extracted ${result.jobs.length} listings and ${result.detailPagesFetched} public detail pages; ${result.eligibleJobIds.length} match the current role and remote-only filters`)
      for (const job of result.jobs) console.log(`${job.title} | ${job.salary || "salary unavailable"} | ${job.url}`)
      console.log(`Saved to ${output}`)
      if (process.argv.includes("--import")) {
        loadLocalEnvironment()
        console.log(JSON.stringify(await importSmileJobs(result.jobs), null, 2))
      } else {
        console.log("No database writes; use --import to add matching jobs to the dashboard")
      }
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
