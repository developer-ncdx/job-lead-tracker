import { loadLocalEnvironment } from "./job-sources/config.mjs"
import {
  fetchEmailAlertJobs,
  resolveEmailAlertEnvironment,
} from "./job-sources/email-alerts.mjs"
import { matchesTargetRole } from "./job-sources/role-filter.mjs"
import { isRemoteOnlyJob } from "./job-sources/sync-utils.mjs"

loadLocalEnvironment()

const settings = resolveEmailAlertEnvironment()

if (!settings.enabled) {
  console.error("Email job alerts are disabled. Set JOB_ALERT_EMAIL_ENABLED=true.")
  process.exitCode = 1
} else {
  try {
    const jobs = await fetchEmailAlertJobs()
    const matching = jobs.filter(
      (job) => matchesTargetRole(job) && isRemoteOnlyJob(job),
    )
    const counts = Object.fromEntries(
      ["linkedin-email", "indeed-email", "onlinejobsph-email"].map((source) => [
        source,
        {
          extracted: jobs.filter((job) => job.source === source).length,
          matching: matching.filter((job) => job.source === source).length,
          timestamped: matching.filter(
            (job) => job.source === source && job.sourceTimestampAt,
          ).length,
          labeled: matching.filter(
            (job) => job.source === source && job.sourceTimestampLabel,
          ).length,
        },
      ]),
    )

    for (const [source, count] of Object.entries(counts)) {
      console.log(
        `${source}: extracted=${count.extracted} matching_remote=${count.matching} timestamped=${count.timestamped} labeled=${count.labeled}`,
      )
    }
    console.log(`Email sync dry run: extracted=${jobs.length} matching_remote=${matching.length}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
