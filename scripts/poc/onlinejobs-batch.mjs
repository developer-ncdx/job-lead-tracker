import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { crawl } from "./onlinejobs.mjs"
import { matchesTargetRole } from "../job-sources/role-filter.mjs"

const keywords = ["developer", "automation", "n8n", "AI engineer", "Bubble"]
const output = resolve("onlinejobs-poc.local", "results.json")
const result = process.argv.includes("--resume")
  ? JSON.parse(await readFile(output, "utf8"))
  : {
  startedAt: new Date().toISOString(),
  status: "running",
  limitPerKeyword: 3,
  keywordResults: [],
  jobs: [],
}
result.status = "running"
delete result.error
delete result.finishedAt
result.skippedJobs ??= []
const seenIds = new Set(result.jobs.map(job => job.sourceId))
const completedKeywords = new Set(result.keywordResults.map(item => item.keyword))
const save = async () => {
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
}

try {
  for (let index = 0; index < keywords.length; index++) {
    // crawl() already spaces the detail requests; space search requests too.
    if (index > 0) await delay(5_000)
    const keyword = keywords[index]
    if (completedKeywords.has(keyword)) continue
    const search = new URL("https://www.onlinejobs.ph/jobseekers/jobsearch")
    search.searchParams.set("jobkeyword", keyword)
    console.log(`Searching: ${keyword}`)
    const jobs = await crawl({ searchUrl: search.href, limit: 3, seenIds, onSkipped: job => {
      result.skippedJobs.push({ ...job, keyword })
      console.log(`Skipped expired job: ${job.url}`)
    } })
    for (const job of jobs) {
      seenIds.add(job.sourceId)
      result.jobs.push({ ...job, discoveredByKeyword: keyword, matchesTargetRole: matchesTargetRole(job) })
    }
    result.keywordResults.push({ keyword, searchUrl: search.href, newJobs: jobs.length })
    await save()
    console.log(`${keyword}: extracted ${jobs.length} new jobs (${result.jobs.length} total)`)
  }
  result.status = "complete"
} catch (error) {
  result.status = "stopped"
  result.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  result.finishedAt = new Date().toISOString()
  await save()
  console.log(`Saved ${result.jobs.length} unique jobs to ${output}; no database writes`)
}
