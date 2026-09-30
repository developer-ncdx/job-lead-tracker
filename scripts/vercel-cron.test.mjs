import { describe, expect, it, vi } from "vitest"

import { createCronHandler } from "../api/cron/sync-job-leads.mjs"

function cronRequest(secret) {
  return new Request("https://example.com/api/cron/sync-job-leads", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

describe("Vercel job sync cron", () => {
  it("rejects requests when the cron secret is missing", async () => {
    const sync = vi.fn()
    const handler = createCronHandler({ sync, environment: {} })
    const response = await handler(cronRequest())

    expect(response.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it("rejects requests with an invalid bearer token", async () => {
    const sync = vi.fn()
    const handler = createCronHandler({
      sync,
      environment: { CRON_SECRET: "correct-secret" },
    })
    const response = await handler(cronRequest("wrong-secret"))

    expect(response.status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })

  it("returns the completed sync summary", async () => {
    const notifyFailure = vi.fn()
    const sync = vi.fn().mockResolvedValue({
      fetched: 50,
      matching: 12,
      unique: 10,
      written: 10,
      existing: 4,
      sourceSummaries: [
        {
          name: "remoteok:global",
          status: "ok",
          fetched: 50,
          matching: 12,
          error: null,
        },
      ],
    })
    const environment = { CRON_SECRET: "correct-secret" }
    const handler = createCronHandler({
      sync,
      environment,
      notifyFailure,
    })
    const response = await handler(cronRequest("correct-secret"))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      fetched: 50,
      matching: 12,
      written: 10,
    })
    expect(sync).toHaveBeenCalledWith({ environment })
    expect(notifyFailure).not.toHaveBeenCalled()
  })

  it("reports source failures as a failed invocation", async () => {
    const notifyFailure = vi.fn().mockResolvedValue(undefined)
    const sync = vi.fn().mockResolvedValue({
      fetched: 0,
      matching: 0,
      unique: 0,
      written: 0,
      sourceSummaries: [
        {
          name: "remoteok:global",
          status: "failed",
          fetched: 0,
          matching: 0,
          error: "upstream unavailable",
        },
      ],
    })
    const handler = createCronHandler({
      sync,
      environment: { CRON_SECRET: "correct-secret" },
      notifyFailure,
    })
    const response = await handler(cronRequest("correct-secret"))

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ success: false })
    expect(notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        cronTitle: "Hourly job lead sync",
        failedSources: [
          expect.objectContaining({
            name: "remoteok:global",
            error: "upstream unavailable",
          }),
        ],
      }),
    )
  })

  it("reports a sync that could not write to Supabase", async () => {
    const notifyFailure = vi.fn().mockResolvedValue(undefined)
    const handler = createCronHandler({
      sync: vi.fn().mockResolvedValue({
        dryRun: true,
        missingSupabaseValues: ["SUPABASE_SERVICE_ROLE_KEY"],
        sourceSummaries: [],
      }),
      environment: { CRON_SECRET: "correct-secret" },
      notifyFailure,
    })

    const response = await handler(cronRequest("correct-secret"))

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      success: false,
      error: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    })
    expect(notifyFailure).toHaveBeenCalledOnce()
  })

  it("emails an unexpected sync failure", async () => {
    const syncError = new Error("database unavailable")
    const notifyFailure = vi.fn().mockResolvedValue(undefined)
    const handler = createCronHandler({
      sync: vi.fn().mockRejectedValue(syncError),
      environment: { CRON_SECRET: "correct-secret" },
      notifyFailure,
    })

    const response = await handler(cronRequest("correct-secret"))

    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({
      success: false,
      error: "database unavailable",
    })
    expect(notifyFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        cronTitle: "Hourly job lead sync",
        error: syncError,
      }),
    )
  })
})
