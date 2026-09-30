import { describe, expect, it, vi } from "vitest"

import { loadSourceConfig } from "./config.mjs"
import { fetchConfiguredSourceResults } from "./index.mjs"

describe("source selection", () => {
  it("skips a production-blocked public feed without disabling it locally", async () => {
    const config = await loadSourceConfig()
    for (const board of [
      "greenhouse",
      "ashby",
      "lever",
      "smartrecruiters",
      "workable",
      "personio",
    ]) {
      config[board] = []
    }
    for (const feed of [
      "weworkremotely",
      "remotive",
      "remoteok",
      "jobicy",
      "himalayas",
      "arbeitnow",
      "arbeitnowuk",
      "themuse",
      "jobtech",
      "eures",
      "ayla",
      "nomado24",
    ]) {
      config[feed] = { enabled: feed === "arbeitnowuk" }
    }
    config.jooble = { enabled: false }
    const fetchImpl = vi.fn()

    const results = await fetchConfiguredSourceResults(config, {
      environment: { JOB_DISABLED_PUBLIC_FEEDS: " arbeitnowuk " },
      fetchImpl,
    })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(results).toContainEqual(
      expect.objectContaining({
        name: "arbeitnowuk:global",
        status: "skipped",
        error: "disabled by JOB_DISABLED_PUBLIC_FEEDS",
      }),
    )
  })
})
