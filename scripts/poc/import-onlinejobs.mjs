import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { loadLocalEnvironment } from "../job-sources/config.mjs"
import { matchesTargetRole } from "../job-sources/role-filter.mjs"
import { buildSupabaseRows, isRemoteOnlyJob } from "../job-sources/sync-utils.mjs"

function onlineJobsId(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" || !["onlinejobs.ph", "www.onlinejobs.ph"].includes(url.hostname)) return null
    return url.pathname.match(/^\/jobseekers\/job\/[^/]+-(\d+)\/?$/)?.[1] ?? null
  } catch {
    return null
  }
}

export function planOnlineJobsImport(savedJobs, existingLeads = []) {
  if (!Array.isArray(savedJobs)) throw new Error("The saved crawl must contain a jobs array")
  const seenIds = new Set(existingLeads.map(lead => onlineJobsId(lead.url)).filter(Boolean))
  for (const lead of existingLeads) {
    if (lead.source?.startsWith("onlinejobsph") && lead.source_job_id) seenIds.add(String(lead.source_job_id))
  }
  const jobs = []
  const skipped = []
  for (const saved of savedJobs) {
    const id = onlineJobsId(saved.url)
    if (!id || id !== String(saved.sourceId) || typeof saved.title !== "string" || !saved.title.trim() || typeof saved.description !== "string" || !saved.description.trim()) {
      throw new Error(`Invalid saved OnlineJobs.ph job: ${saved.sourceId ?? "unknown ID"}`)
    }
    const job = {
      source: "onlinejobsph",
      sourceJobId: id,
      title: saved.title.trim(),
      url: `https://www.onlinejobs.ph${new URL(saved.url).pathname.replace(/\/$/, "")}`,
      description: [
        saved.description,
        saved.employmentType && `Employment type: ${saved.employmentType}`,
        saved.salary && `Salary: ${saved.salary}`,
        saved.hoursPerWeek && `Hours per week: ${saved.hoursPerWeek}`,
      ].filter(Boolean).join("\n\n"),
      isRemote: true,
      sourceTimestampKind: saved.dateUpdated ? "updated" : null,
      sourceTimestampLabel: saved.dateUpdated ? `Updated ${saved.dateUpdated}` : null,
    }
    let reason
    if (!matchesTargetRole(job)) reason = "outside_target_roles"
    else if (!isRemoteOnlyJob(job)) reason = "not_remote_only"
    else if (seenIds.has(id)) reason = "already_present"
    if (reason) {
      skipped.push({ sourceId: id, title: job.title, reason })
      continue
    }
    seenIds.add(id)
    jobs.push(job)
  }
  return { jobs, skipped }
}

export async function importSavedOnlineJobs({
  inputPath = "onlinejobs-poc.local/results.json",
  dryRun = false,
  environment = process.env,
  clientFactory = createClient,
} = {}) {
  const saved = JSON.parse(await readFile(inputPath, "utf8"))
  // Validate the entire file before making any database request.
  planOnlineJobsImport(saved.jobs)
  const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL
  const key = environment.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  const owner = environment.JOB_LEADS_OWNER_ID?.trim()
  const ownerId = owner && owner !== "00000000-0000-0000-0000-000000000000" ? owner : null
  const client = clientFactory(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const existing = []
  for (let offset = 0; ; offset += 500) {
    let query = client.from("job_leads")
      .select("id,source,source_job_id,url")
      .or("source.ilike.onlinejobsph%,url.ilike.%onlinejobs.ph%")
      .order("id")
      .range(offset, offset + 499)
    query = ownerId ? query.eq("user_id", ownerId) : query.is("user_id", null)
    const { data, error } = await query
    if (error) throw new Error(`Could not check existing OnlineJobs.ph jobs: ${error.message}`)
    existing.push(...data)
    if (data.length < 500) break
  }
  const plan = planOnlineJobsImport(saved.jobs, existing)
  let imported = []
  if (!dryRun && plan.jobs.length) {
    const { data, error } = await client.from("job_leads")
      .upsert(buildSupabaseRows(plan.jobs, ownerId), {
        onConflict: "user_id,source,source_job_id",
        ignoreDuplicates: true,
      })
      .select("id,source_job_id,title,url")
    if (error) throw new Error(`Could not import saved OnlineJobs.ph jobs: ${error.message}`)
    imported = data
  }
  return { dryRun, savedJobs: saved.jobs.length, eligibleNewJobs: plan.jobs.length, imported, skipped: plan.skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    loadLocalEnvironment()
    const inputPath = process.argv.find(arg => arg.startsWith("--input="))?.slice(8)
    const result = await importSavedOnlineJobs({ inputPath, dryRun: process.argv.includes("--dry-run") })
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
