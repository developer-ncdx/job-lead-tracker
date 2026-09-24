import { fetchAshbyJobs } from "./ashby.mjs"
import { fetchGreenhouseJobs } from "./greenhouse.mjs"
import { fetchHimalayasJobs } from "./himalayas.mjs"
import { fetchJobicyJobs } from "./jobicy.mjs"
import { fetchJoobleJobs } from "./jooble.mjs"
import { fetchLeverJobs } from "./lever.mjs"
import { fetchRemotiveJobs } from "./remotive.mjs"
import { fetchRemoteOkJobs } from "./remote-ok.mjs"
import { fetchWeWorkRemotelyJobs } from "./we-work-remotely.mjs"

const BOARD_ADAPTERS = Object.freeze({
  greenhouse: fetchGreenhouseJobs,
  ashby: fetchAshbyJobs,
  lever: fetchLeverJobs,
})

const PUBLIC_FEED_ADAPTERS = Object.freeze({
  weworkremotely: fetchWeWorkRemotelyJobs,
  remotive: fetchRemotiveJobs,
  remoteok: fetchRemoteOkJobs,
  jobicy: fetchJobicyJobs,
  himalayas: fetchHimalayasJobs,
})

async function captureSourceResult(source, name, fetchJobs) {
  const startedAt = Date.now()

  try {
    const jobs = await fetchJobs()

    return {
      source,
      name,
      status: "ok",
      jobs,
      durationMs: Date.now() - startedAt,
      error: null,
    }
  } catch (error) {
    return {
      source,
      name,
      status: "failed",
      jobs: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchConfiguredSourceResults(
  config,
  { environment = process.env, fetchImpl = fetch } = {},
) {
  const boardTasks = Object.entries(BOARD_ADAPTERS).flatMap(
    ([source, fetchJobs]) =>
      config[source].map((boardConfig) =>
        captureSourceResult(
          source,
          `${source}:${boardConfig.board}`,
          () => fetchJobs(boardConfig, { fetchImpl }),
        ),
      ),
  )
  const publicFeedTasks = Object.entries(PUBLIC_FEED_ADAPTERS)
    .filter(([source]) => config[source]?.enabled !== false)
    .map(([source, fetchJobs]) =>
      captureSourceResult(source, `${source}:global`, () =>
        fetchJobs(config[source], { fetchImpl }),
      ),
    )
  const results = await Promise.all([...boardTasks, ...publicFeedTasks])

  for (const source of Object.keys(PUBLIC_FEED_ADAPTERS)) {
    if (config[source]?.enabled === false) {
      results.push({
        source,
        name: `${source}:global`,
        status: "skipped",
        jobs: [],
        durationMs: 0,
        error: "disabled in job-sources.config.json",
      })
    }
  }

  const joobleConfig = config.jooble ?? {}

  if (joobleConfig.enabled === false) {
    results.push({
      source: "jooble",
      name: "jooble:global",
      status: "skipped",
      jobs: [],
      durationMs: 0,
      error: "disabled in job-sources.config.json",
    })
  } else if (!environment.JOOBLE_API_KEY) {
    results.push({
      source: "jooble",
      name: "jooble:global",
      status: "skipped",
      jobs: [],
      durationMs: 0,
      error: "JOOBLE_API_KEY is not configured",
    })
  } else {
    results.push(
      await captureSourceResult("jooble", "jooble:global", () =>
        fetchJoobleJobs(joobleConfig, {
          apiKey: environment.JOOBLE_API_KEY,
          fetchImpl,
        }),
      ),
    )
  }

  return results
}
