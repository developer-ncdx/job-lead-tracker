import {
  loadLocalEnvironment,
  loadSourceConfig,
} from "./job-sources/config.mjs"
import { fetchConfiguredSourceResults } from "./job-sources/index.mjs"
import { matchesTargetRole } from "./job-sources/role-filter.mjs"

loadLocalEnvironment()

const config = await loadSourceConfig()
const requestedSource = process.argv
  .find((argument) => argument.startsWith("--source="))
  ?.split("=")[1]
const results = await fetchConfiguredSourceResults(config)
const visibleResults = requestedSource
  ? results.filter((result) => result.source === requestedSource)
  : results

if (visibleResults.length === 0) {
  console.error(`No configured source matched "${requestedSource}".`)
  process.exitCode = 1
} else {
  for (const result of visibleResults) {
    if (result.status !== "ok") {
      console.log(
        `${result.name}: ${result.status.toUpperCase()} (${result.error})`,
      )
      continue
    }

    const matchingJobs = result.jobs.filter(matchesTargetRole)
    const timestampedJobs = matchingJobs.filter(
      (job) => job.sourceTimestampAt,
    )
    const remoteJobs = matchingJobs.filter((job) => job.isRemote)

    console.log(
      `${result.name}: OK fetched=${result.jobs.length} ` +
        `matching=${matchingJobs.length} remote=${remoteJobs.length} ` +
        `timestamped=${timestampedJobs.length} duration=${result.durationMs}ms`,
    )
  }

  const working = visibleResults.filter(
    (result) => result.status === "ok",
  ).length
  const failed = visibleResults.filter(
    (result) => result.status === "failed",
  ).length
  const skipped = visibleResults.filter(
    (result) => result.status === "skipped",
  ).length

  console.log(
    `Summary: working=${working} failed=${failed} skipped=${skipped}`,
  )

  if (failed > 0) {
    process.exitCode = 1
  }
}
