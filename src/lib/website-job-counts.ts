import type { JobLead } from "@/lib/database.types"

const sourceWebsites: Record<string, string> = {
  greenhouse: "greenhouse.io",
  ashby: "ashbyhq.com",
  lever: "lever.co",
  smartrecruiters: "smartrecruiters.com",
  workable: "workable.com",
  personio: "personio.de",
  weworkremotely: "weworkremotely.com",
  remotive: "remotive.com",
  remoteok: "remoteok.com",
  jobicy: "jobicy.com",
  himalayas: "himalayas.app",
  arbeitnow: "arbeitnow.com",
  arbeitnowuk: "arbeitnow.co.uk",
  themuse: "themuse.com",
  jobtech: "JobTech",
  eures: "EURES",
  ayla: "aylagov.com",
  nomado24: "nomado24.de",
  jooble: "jooble.org",
  linkedin: "linkedin.com",
  indeed: "indeed.com",
  onlinejobsph: "onlinejobs.ph",
  smileandhire: "smileandhire.com",
  upwork: "upwork.com",
}

type JobWebsite = Pick<JobLead, "source" | "url">

function websiteForJob(job: JobWebsite) {
  const source = job.source?.trim().toLowerCase().replace(/-email$/, "") ?? ""
  if (Object.hasOwn(sourceWebsites, source)) return sourceWebsites[source]
  try {
    const url = new URL(job.url)
    if (["https:", "http:"].includes(url.protocol)) {
      return url.hostname.replace(/^www\./, "")
    }
  } catch { /* Imported jobs may not have a usable posting URL. */ }
  return "Other"
}

export function countJobsByWebsite(jobs: JobWebsite[]) {
  const counts = new Map<string, number>()
  for (const job of jobs) {
    const website = websiteForJob(job)
    counts.set(website, (counts.get(website) ?? 0) + 1)
  }
  return [...counts].map(([website, count]) => ({ website, count }))
    .sort((a, b) => b.count - a.count || a.website.localeCompare(b.website))
}
