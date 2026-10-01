import { fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SyncPanel } from "@/components/sync-panel"
import { PreviewLeadDashboard } from "@/components/lead-dashboard"
import { makeSyncRun } from "@/test/sync-fixtures"

beforeEach(() => window.history.replaceState(null, "", "/"))
afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, "", "/")
})
describe("Sync & cron navigation", () => {
  it("has a main navbar ordered Job leads, then Sync & cron, with separate job filters", () => {
    render(<PreviewLeadDashboard />)
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument()
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    })
    const links = within(navigation).getAllByRole("link")
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "Job leads",
      "Sync & cron",
    ])
    expect(links[0]).toHaveAttribute("aria-current", "page")
    expect(
      within(
        screen.getByRole("tablist", { name: "Job lead views" }),
      ).getAllByRole("tab"),
    ).toHaveLength(2)
    const syncLink = within(navigation).getByRole("link", {
      name: "Sync & cron",
    })
    fireEvent.click(syncLink)
    expect(syncLink).toHaveAttribute("aria-current", "page")
    expect(window.location.hash).toBe("#sync-cron")
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
    expect(screen.getByText("Scheduled cron health")).toBeInTheDocument()
    expect(screen.queryByText("Senior AI Engineer")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /sort by posting date/i }),
    ).not.toBeInTheDocument()
    fireEvent.click(within(navigation).getByRole("link", { name: "Job leads" }))
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument()
    expect(screen.queryByText("Scheduled cron health")).not.toBeInTheDocument()
  })
  it("keeps keyboard All jobs and Priority navigation within the Job leads page", () => {
    render(<PreviewLeadDashboard />)
    fireEvent.keyDown(screen.getByRole("tab", { name: /all jobs/i }), {
      key: "End",
    })
    const priorityTab = screen.getByRole("tab", { name: /priority/i })
    expect(priorityTab).toHaveFocus()
    expect(priorityTab).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(priorityTab, { key: "Home" })
    expect(screen.getByRole("tab", { name: /all jobs/i })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })
  it("keeps the Priority selection when moving between navbar pages", () => {
    render(<PreviewLeadDashboard />)
    fireEvent.click(screen.getByRole("tab", { name: /priority/i }))
    expect(screen.queryByText("Lead Programmer")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: "Sync & cron" }))
    fireEvent.click(screen.getByRole("link", { name: "Job leads" }))
    expect(screen.getByRole("tab", { name: /priority/i })).toHaveAttribute(
      "aria-selected",
      "true",
    )
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument()
    expect(screen.queryByText("Lead Programmer")).not.toBeInTheDocument()
  })
  it("supports direct navigation to the sync page and browser back/forward events", () => {
    window.history.replaceState(null, "", "/#sync-cron")
    render(<PreviewLeadDashboard />)
    expect(screen.getByRole("link", { name: "Sync & cron" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByText("Scheduled cron health")).toBeInTheDocument()
    window.history.replaceState(null, "", "/#job-leads")
    fireEvent(window, new PopStateEvent("popstate"))
    expect(screen.getByText("Senior AI Engineer")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Job leads" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    window.history.replaceState(null, "", "/#sync-cron")
    fireEvent(window, new HashChangeEvent("hashchange"))
    expect(screen.getByText("Scheduled cron health")).toBeInTheDocument()
  })
  it("does not let a newer local success hide failed scheduled-cron health", () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-01T02:00:00Z"))
    const cron = makeSyncRun({
      id: "cron-failed",
      status: "failed",
      sources: [
        {
          name: "email-alerts",
          status: "failed",
          fetched: 0,
          matching: 0,
          error: "IMAP unavailable",
        },
      ],
    })
    const local = makeSyncRun({
      id: "local-ok",
      trigger: "local_sync",
      started_at: "2026-10-01T01:45:00Z",
      finished_at: "2026-10-01T01:47:00Z",
    })
    render(
      <SyncPanel
        runs={[local, cron]}
        latestCron={cron}
        lastSuccess={local}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Oct 1, 2026, 9:47 AM PHT")).toBeInTheDocument()
    expect(
      screen.getByText("Local sync · completed successfully"),
    ).toBeInTheDocument()
    expect(screen.getByText("IMAP unavailable")).toBeInTheDocument()
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(
      3,
    )
  })
  it("marks unavailable history as unverified, rather than showing a stale healthy badge", () => {
    render(
      <SyncPanel
        runs={[makeSyncRun()]}
        latestCron={makeSyncRun()}
        lastSuccess={makeSyncRun()}
        error="Could not load history"
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText("Unavailable")).toBeInTheDocument()
    expect(screen.queryByText("Healthy")).not.toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load history",
    )
  })
  it("refreshes status without claiming to trigger a sync", () => {
    const refresh = vi.fn()
    render(
      <SyncPanel
        runs={[]}
        latestCron={null}
        lastSuccess={null}
        onRefresh={refresh}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.getByText(/does not start a job sync/i)).toBeInTheDocument()
    expect(screen.getByText("No tracked success")).toBeInTheDocument()
  })
})
