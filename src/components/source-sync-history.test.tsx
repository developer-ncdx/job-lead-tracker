import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { SourceSyncHistory } from "@/components/source-sync-history"
import type { JobSyncRun } from "@/lib/database.types"
import { makeSyncRun } from "@/test/sync-fixtures"

const source = (name: string, values = {}) => ({
  name,
  status: "ok",
  fetched: 100,
  matching: 7,
  error: null,
  ...values,
})
const historyRows = () => within(screen.getByRole("table", {
  name: "Source sync history",
})).getAllByRole("row").slice(1)

describe("per-source sync history", () => {
  it("shows the same API separately for each hourly run, newest first", () => {
    const earlier = makeSyncRun({
      id: "earlier",
      sources: [source("greenhouse:stripe", { fetched: 713 })],
    })
    const later = makeSyncRun({
      id: "later",
      started_at: "2026-10-01T02:00:00Z",
      sources: [
        source("greenhouse:stripe", { fetched: 714 }),
        source("email-alerts:gmail", { fetched: 320, matching: 132 }),
      ],
    })
    render(<SourceSyncHistory runs={[earlier, later]} />)

    const rows = historyRows()
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent("Oct 1, 2026, 10:00 AM PHT")
    expect(rows[0]).toHaveTextContent("greenhouse:stripe")
    expect(rows[0]).toHaveTextContent("Success")
    expect(rows[0]).toHaveTextContent("714")
    expect(rows[1]).toHaveTextContent("Gmail alerts (includes Google Alerts)")
    expect(rows[1]).toHaveTextContent("132")
    expect(rows[2]).toHaveTextContent("Oct 1, 2026, 9:00 AM PHT")
    expect(rows[2]).toHaveTextContent("713")
    expect(screen.getByText(/source success means fetching completed/i))
      .toBeInTheDocument()
  })

  it("preserves individual source outcomes even when the overall run fails", () => {
    render(<SourceSyncHistory runs={[makeSyncRun({
      status: "failed",
      sources: [
        source("greenhouse:stripe"),
        source("email-alerts:gmail", {
          status: "failed", fetched: 0, matching: 0, error: "IMAP unavailable",
        }),
        source("linkedin-email:timestamp-backfill", {
          status: "warning", error: "HTTP 429",
        }),
        source("jooble:global", {
          status: "skipped", fetched: 0, matching: 0, error: "API key not configured",
        }),
      ],
    })]} />)

    const rows = historyRows()
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent("Success")
    expect(rows[1]).toHaveTextContent("Failed")
    expect(rows[1]).toHaveTextContent("IMAP unavailable")
    expect(rows[2]).toHaveTextContent("Warning")
    expect(rows[2]).toHaveTextContent("HTTP 429")
    expect(rows[3]).toHaveTextContent("Skipped")
    fireEvent.change(screen.getByRole("combobox", { name: "Source status" }), {
      target: { value: "ok" },
    })
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toHaveTextContent("greenhouse:stripe")
  })

  it("filters one source across cron and local runs without inventing Google counts", () => {
    render(<SourceSyncHistory runs={[
      makeSyncRun({
        id: "cron",
        sources: [source("email-alerts:gmail"), source("greenhouse:stripe")],
      }),
      makeSyncRun({
        id: "local",
        trigger: "local_sync",
        sources: [source("email-alerts:gmail"), source("google-alerts:backfill")],
      }),
    ]} />)
    fireEvent.change(screen.getByRole("combobox", { name: "API / source" }), {
      target: { value: "email-alerts:gmail" },
    })
    const rows = historyRows()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Scheduled cron")
    expect(rows[1]).toHaveTextContent("Local sync")
    expect(rows.every(row => row.textContent?.includes("Gmail alerts (includes Google Alerts)")))
      .toBe(true)
    expect(screen.queryByText("Google Alerts · manual backfill", { selector: "p" }))
      .not.toBeInTheDocument()
  })

  it("paginates source checks and resets to the first page when filtering", () => {
    render(<SourceSyncHistory runs={[makeSyncRun({
      sources: Array.from({ length: 22 }, (_, index) => source(`api:board-${index}`)),
    })]} />)
    expect(historyRows()).toHaveLength(20)
    expect(screen.getByRole("button", { name: "Previous source results page" }))
      .toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Next source results page" }))
    expect(historyRows()).toHaveLength(2)
    expect(historyRows()[0]).toHaveTextContent("api:board-20")
    expect(screen.getByText("Showing 21–22 of 22 source checks")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next source results page" }))
      .toBeDisabled()
    fireEvent.change(screen.getByRole("combobox", { name: "API / source" }), {
      target: { value: "api:board-0" },
    })
    expect(historyRows()).toHaveLength(1)
    expect(historyRows()[0]).toHaveTextContent("api:board-0")
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument()
  })

  it("clamps pagination when a refreshed history has fewer source results", () => {
    const { rerender } = render(<SourceSyncHistory runs={[makeSyncRun({
      sources: Array.from({ length: 22 }, (_, index) => source(`api:board-${index}`)),
    })]} />)
    fireEvent.click(screen.getByRole("button", { name: "Next source results page" }))
    rerender(<SourceSyncHistory runs={[makeSyncRun({ sources: [source("email-alerts:gmail")] })]} />)
    expect(historyRows()).toHaveLength(1)
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous source results page" }))
      .toBeDisabled()
  })

  it("does not fabricate success for running, missing or malformed source records", () => {
    const emptyRuns: JobSyncRun[] = [
      makeSyncRun({ id: "running", status: "running", sources: [] }),
      makeSyncRun({ id: "missing", sources: null }),
      makeSyncRun({ id: "malformed", sources: [{ name: "fake", status: "bogus" }] }),
    ]
    const { rerender } = render(<SourceSyncHistory runs={emptyRuns} />)
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText(/No per-source results have been recorded yet/))
      .toBeInTheDocument()
    rerender(<SourceSyncHistory runs={[]} isLoading />)
    expect(screen.getByText("Loading source sync history…")).toBeInTheDocument()
  })

  it("explains empty filter results instead of showing unrelated successes", () => {
    render(<SourceSyncHistory runs={[makeSyncRun({ sources: [source("email-alerts:gmail")] })]} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Source status" }), {
      target: { value: "failed" },
    })
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("No source results match these filters."))
      .toBeInTheDocument()
  })

  it("keeps a disappearing source filter explicit after refreshing history", () => {
    const { rerender } = render(<SourceSyncHistory runs={[makeSyncRun({
      sources: [source("email-alerts:gmail")],
    })]} />)
    fireEvent.change(screen.getByRole("combobox", { name: "API / source" }), {
      target: { value: "email-alerts:gmail" },
    })
    rerender(<SourceSyncHistory runs={[makeSyncRun({ sources: [source("greenhouse:stripe")] })]} />)
    expect(screen.getByRole("combobox", { name: "API / source" }))
      .toHaveValue("email-alerts:gmail")
    expect(screen.getByRole("option", {
      name: "Gmail alerts (includes Google Alerts) (no recent results)",
    })).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByText("No source results match these filters."))
      .toBeInTheDocument()
  })

  it("shows numeric new and existing counts separately from fetched and matching", () => {
    render(<SourceSyncHistory runs={[makeSyncRun({ sources: [
      source("greenhouse:stripe", { fetched: 717, matching: 7, new_jobs: 2, existing_jobs: 5 }),
      source("email-alerts:gmail", { new_jobs: 0, existing_jobs: 7 }),
    ] })]} />)
    expect(screen.getByRole("columnheader", { name: "New leads added" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Existing leads refreshed" })).toBeInTheDocument()
    const rows = historyRows()
    expect(within(rows[0]).getAllByRole("cell").slice(-4).map(cell => cell.textContent))
      .toEqual(["717", "7", "2", "5"])
    expect(within(rows[1]).getAllByRole("cell").slice(-2).map(cell => cell.textContent))
      .toEqual(["0", "7"])
  })

  it("distinguishes missing historical counts and date-only backfills from numeric zero", () => {
    render(<SourceSyncHistory runs={[makeSyncRun({ sources: [
      source("greenhouse:stripe"),
      source("linkedin-email:timestamp-backfill"),
    ] })]} />)
    const rows = historyRows()
    expect(within(rows[0]).getAllByText("Not recorded")).toHaveLength(2)
    expect(within(rows[1]).getAllByText("Not applicable")).toHaveLength(2)
  })
})
