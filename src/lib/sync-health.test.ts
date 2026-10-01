import { describe, expect, it } from "vitest"
import { cronHealth, nextSyncTime, readSyncSources } from "@/lib/sync-health"
import { makeSyncRun } from "@/test/sync-fixtures"

const now = Date.parse("2026-10-01T02:00:00Z")
describe("cron health", () => {
  it("does not claim health without a scheduled run", () => {
    expect(cronHealth(null, now).label).toBe("Not verified")
  })
  it("distinguishes recent success, failure and warnings", () => {
    expect(cronHealth(makeSyncRun(), now).label).toBe("Healthy")
    expect(cronHealth(makeSyncRun({ status: "failed" }), now).label).toBe(
      "Failed",
    )
    expect(cronHealth(makeSyncRun({ status: "warning" }), now).label).toBe(
      "Warnings",
    )
  })
  it("marks a stopped scheduler overdue even if its last run succeeded", () => {
    expect(cronHealth(makeSyncRun(), now + 16 * 60_000).label).toBe("Overdue")
  })
  it("does not confuse an interrupted run with healthy ingestion", () => {
    expect(
      cronHealth(makeSyncRun({ status: "running", finished_at: null }), now)
        .label,
    ).toBe("Incomplete")
    expect(
      cronHealth(
        makeSyncRun({
          status: "running",
          started_at: "2026-10-01T01:59:00Z",
          finished_at: null,
        }),
        now,
      ).label,
    ).toBe("Running")
  })
  it("does not claim health when a date is unreadable", () => {
    expect(cronHealth(makeSyncRun({ started_at: "invalid" }), now).label).toBe(
      "Unknown",
    )
  })
  it("advances the expected hourly slot across Philippine midnight", () => {
    expect(nextSyncTime(Date.parse("2026-10-01T15:59:59Z")).toISOString()).toBe(
      "2026-10-01T16:00:00.000Z",
    )
    expect(nextSyncTime(Date.parse("2026-10-01T16:00:00Z")).toISOString()).toBe(
      "2026-10-01T17:00:00.000Z",
    )
  })
  it("ignores malformed source summaries", () => {
    expect(
      readSyncSources([
        null,
        {},
        "failed",
        { name: "x", status: "bogus", fetched: 0, matching: 0, error: null },
      ]),
    ).toEqual([])
  })
})
