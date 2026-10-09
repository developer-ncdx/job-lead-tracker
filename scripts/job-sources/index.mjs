import { fetchArbeitnowJobs } from "./arbeitnow.mjs"
import { fetchAshbyJobs } from "./ashby.mjs"
import { fetchAylaJobs } from "./ayla.mjs"
import { fetchEuresJobs } from "./eures.mjs"
import { fetchGreenhouseJobs } from "./greenhouse.mjs"
import { fetchHimalayasJobs } from "./himalayas.mjs"
import { fetchJobicyJobs } from "./jobicy.mjs"
import { fetchJobTechJobs } from "./jobtech.mjs"
import { fetchJoobleJobs } from "./jooble.mjs"
import { fetchLeverJobs } from "./lever.mjs"
import { fetchNomado24Jobs } from "./nomado24.mjs"
import { fetchPersonioJobs } from "./personio.mjs"
import { fetchRemotiveJobs } from "./remotive.mjs"
import { fetchRemoteOkJobs } from "./remote-ok.mjs"
import { fetchSmartRecruitersJobs } from "./smartrecruiters.mjs"
import { fetchTheMuseJobs } from "./the-muse.mjs"
import { fetchWeWorkRemotelyJobs } from "./we-work-remotely.mjs"
import { fetchWorkableJobs } from "./workable.mjs"
import { fetchOnlineJobsPhJobs } from "./onlinejobsph.mjs"
import { fetchSmileAndHireJobs } from "./smileandhire.mjs"
import { fetchCrewClubJobs } from "./crewclub.mjs"
import { captureCrawlResult } from "./crawl-state.mjs"

const BOARD_ADAPTERS = Object.freeze({
  greenhouse: fetchGreenhouseJobs,
  ashby: fetchAshbyJobs,
  lever: fetchLeverJobs,
  smartrecruiters: fetchSmartRecruitersJobs,
  workable: fetchWorkableJobs,
  personio: fetchPersonioJobs,
})

const PUBLIC_FEED_ADAPTERS = Object.freeze({
  weworkremotely: fetchWeWorkRemotelyJobs,
  remotive: fetchRemotiveJobs,
  remoteok: fetchRemoteOkJobs,
  jobicy: fetchJobicyJobs,
  himalayas: fetchHimalayasJobs,
  arbeitnow: fetchArbeitnowJobs,
  arbeitnowuk: fetchArbeitnowJobs,
  themuse: fetchTheMuseJobs,
  jobtech: fetchJobTechJobs,
  eures: fetchEuresJobs,
  ayla: fetchAylaJobs,
  nomado24: fetchNomado24Jobs,
})

const WEB_CRAWL_ADAPTERS = Object.freeze({
  onlinejobsph: fetchOnlineJobsPhJobs,
  smileandhire: fetchSmileAndHireJobs,
  crewclub: fetchCrewClubJobs,
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
  { environment = process.env, fetchImpl = fetch, client = null, userId = null, wait } = {},
) {
  const disabledPublicFeeds = new Set(
    (environment.JOB_DISABLED_PUBLIC_FEEDS ?? "")
      .split(",")
      .map((source) => source.trim().toLowerCase())
      .filter(Boolean),
  )
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
    .filter(
      ([source]) =>
        config[source]?.enabled !== false && !disabledPublicFeeds.has(source),
    )
    .map(([source, fetchJobs]) =>
      captureSourceResult(source, `${source}:global`, () =>
        fetchJobs(config[source], { fetchImpl, environment }),
      ),
    )
  const crawlTasks = Object.entries(WEB_CRAWL_ADAPTERS).map(([source, fetchJobs]) => {
    if (config[source]?.enabled !== true || disabledPublicFeeds.has(source)) {
      return Promise.resolve({ source, name: `${source}:web`, status: "skipped", jobs: [], durationMs: 0, error: disabledPublicFeeds.has(source) ? "disabled by JOB_DISABLED_PUBLIC_FEEDS" : "disabled in job-sources.config.json" })
    }
    return captureCrawlResult(source, state => fetchJobs(config[source], { fetchImpl, wait, state }), { client, userId })
  })
  const results = await Promise.all([...boardTasks, ...publicFeedTasks, ...crawlTasks])

  for (const source of Object.keys(PUBLIC_FEED_ADAPTERS)) {
    if (disabledPublicFeeds.has(source)) {
      results.push({
        source,
        name: `${source}:global`,
        status: "skipped",
        jobs: [],
        durationMs: 0,
        error: "disabled by JOB_DISABLED_PUBLIC_FEEDS",
      })
    } else if (config[source]?.enabled === false) {
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
