import { setTimeout as delay } from "node:timers/promises"

import {
  loadLocalEnvironment,
  loadSourceConfig,
} from "./job-sources/config.mjs"
import {
  printSyncSummary,
  runJobSync,
} from "./sync-job-leads.mjs"

loadLocalEnvironment()

const config = await loadSourceConfig()
const configuredInterval = Number(
  process.env.JOB_SYNC_INTERVAL_MINUTES ??
    config.pollIntervalMinutes ??
    60,
)
const intervalMinutes =
  Number.isFinite(configuredInterval) && configuredInterval >= 1
    ? configuredInterval
    : 60
const intervalMs = intervalMinutes * 60_000

console.log(`Job sync watcher started; interval=${intervalMinutes} minutes.`)

while (true) {
  try {
    const summary = await runJobSync({ config })
    printSyncSummary(summary)
  } catch (error) {
    console.error(
      `Job sync failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  await delay(intervalMs)
}
