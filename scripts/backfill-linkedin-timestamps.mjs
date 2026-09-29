import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"

import { loadLocalEnvironment } from "./job-sources/config.mjs"
import { backfillLinkedInTimestamps } from "./job-sources/linkedin-timestamp-backfill.mjs"

export async function runLinkedInTimestampBackfill({
  environment = process.env,
  fetchImpl = fetch,
  clientFactory = createClient,
} = {}) {
  const url = environment.SUPABASE_URL || environment.VITE_SUPABASE_URL
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    )
  }

  const client = clientFactory(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return backfillLinkedInTimestamps(client, {
    fetchImpl,
    limit: environment.JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT,
  })
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  loadLocalEnvironment()

  try {
    const summary = await runLinkedInTimestampBackfill()
    console.log(
      `LinkedIn timestamp backfill: attempted=${summary.attempted} ` +
        `updated=${summary.updated} unresolved=${summary.unresolved} ` +
        `failed=${summary.failures.length}`,
    )

    if (summary.failures.length > 0) {
      process.exitCode = 1
    }
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "LinkedIn backfill failed",
    )
    process.exitCode = 1
  }
}
