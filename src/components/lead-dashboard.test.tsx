import { useState } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { DashboardView } from "@/components/lead-dashboard"
import type { JobLead } from "@/lib/database.types"

function makeLead(id: string, values: Partial<JobLead> = {}): JobLead {
  return {
    id,
    user_id: null,
    title: `Engineer ${id}`,
    description: "Remote engineering job",
    url: `https://example.com/jobs/${id}`,
    source: "greenhouse",
    source_job_id: id,
    company: "Example",
    location: "Remote",
    is_remote: true,
    is_priority: false,
    is_read: false,
    applied_at: null,
    not_interested_at: null,
    source_timestamp_at: "2026-10-05T00:00:00Z",
    source_timestamp_kind: "published",
    source_timestamp_label: null,
    first_seen_at: "2026-10-05T00:00:00Z",
    last_seen_at: "2026-10-05T00:00:00Z",
    created_at: "2026-10-05T00:00:00Z",
    updated_at: "2026-10-05T00:00:00Z",
    ...values,
  }
}

const jobs = [
  makeLead("new"),
  makeLead("read", { is_read: true, is_priority: true }),
  makeLead("applied", { is_read: true, applied_at: "2026-10-05T02:00:00Z" }),
  makeLead("dismissed", { is_read: true, not_interested_at: "2026-10-05T03:00:00Z" }),
]

function Harness({ initialLeads = jobs }: { initialLeads?: JobLead[] }) {
  const [leads, setLeads] = useState(initialLeads)
  return (
    <DashboardView
      leads={leads}
      isLoading={false}
      isRefreshing={false}
      error={null}
      realtimeWarning={null}
      userLabel="Test tracker"
      onRefresh={vi.fn()}
      onSetNotInterested={async (id, dismissed) => {
        setLeads((current) => current.map((lead) => lead.id === id ? {
          ...lead,
          not_interested_at: dismissed ? new Date().toISOString() : null,
          applied_at: dismissed ? null : lead.applied_at,
          is_read: dismissed ? true : lead.is_read,
        } : lead))
      }}
      onSetRead={async (id, is_read) => {
        setLeads((current) => current.map((lead) => lead.id === id ? { ...lead, is_read } : lead))
      }}
      onSetApplied={async (id, applied) => {
        setLeads((current) => current.map((lead) => lead.id === id ? {
          ...lead,
          applied_at: applied ? new Date().toISOString() : null,
          not_interested_at: applied ? null : lead.not_interested_at,
          is_read: applied ? true : lead.is_read,
        } : lead))
      }}
      syncPanel={<div>Sync history content</div>}
    />
  )
}

beforeEach(() => window.history.replaceState(null, "", "#job-leads"))

describe("DashboardView job tracking", () => {
  it("adds an Applied jobs navigation page with only applied leads", () => {
    render(<Harness />)
    expect(screen.getAllByRole("article")).toHaveLength(2)
    expect(screen.queryByRole("article", { name: "Engineer applied" })).not.toBeInTheDocument()
    expect(screen.queryByRole("article", { name: "Engineer dismissed" })).not.toBeInTheDocument()
    expect(screen.getByText("2 leads")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: /applied jobs/i }))
    expect(window.location.hash).toBe("#applied-jobs")
    expect(screen.getByRole("heading", { name: "Applied jobs" })).toBeInTheDocument()
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByRole("article", { name: "Engineer applied" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /applied jobs/i })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByRole("link", { name: "Sync & cron" }))
    expect(screen.getByText("Sync history content")).toBeInTheDocument()
    expect(screen.queryByRole("article")).not.toBeInTheDocument()
  })

  it("marks jobs read on opening and filters both read states", async () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by read status" }), { target: { value: "unread" } })
    expect(screen.getAllByRole("article")).toHaveLength(1)
    fireEvent.click(screen.getByRole("link", { name: /open posting/i }))
    await waitFor(() => expect(screen.getByText("No unread jobs")).toBeInTheDocument())
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by read status" }), { target: { value: "read" } })
    expect(screen.getAllByRole("article")).toHaveLength(2)
    fireEvent.click(screen.getByRole("button", { name: "Mark Engineer new as unread" }))
    await waitFor(() => expect(screen.queryByRole("article", { name: "Engineer new" })).not.toBeInTheDocument())
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by read status" }), { target: { value: "all" } })
    expect(screen.getByRole("article", { name: "Engineer new" })).toHaveAttribute("data-read-state", "unread")
  })

  it("adds an application, then undoes it from the Applied jobs page", async () => {
    render(<Harness initialLeads={[makeLead("new")]} />)
    fireEvent.click(screen.getByRole("button", { name: "Mark Engineer new as applied" }))
    await waitFor(() => expect(screen.getByText("No job leads yet")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("link", { name: /applied jobs/i }))
    expect(screen.getByRole("article", { name: "Engineer new" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Remove Engineer new from applied jobs" }))
    await waitFor(() => expect(screen.getByText("No applied jobs yet")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("link", { name: "Job leads" }))
    expect(screen.getByRole("article", { name: "Engineer new" })).toBeInTheDocument()
    expect(screen.getByRole("article")).toHaveAttribute("data-read-state", "read")
  })

  it("supports direct Applied jobs links and browser navigation", () => {
    window.history.replaceState(null, "", "#applied-jobs")
    render(<Harness />)
    expect(screen.getByRole("heading", { name: "Applied jobs" })).toBeInTheDocument()
    act(() => {
      window.history.replaceState(null, "", "#job-leads")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(screen.getByRole("heading", { name: "Job leads" })).toBeInTheDocument()
    expect(screen.getAllByRole("article")).toHaveLength(2)
  })

  it("paginates applied jobs and resets pagination when changing filters", () => {
    const leads = Array.from({ length: 12 }, (_, index) => makeLead(`job-${index}`, {
      is_read: true,
      applied_at: "2026-10-05T02:00:00Z",
    }))
    render(<Harness initialLeads={leads} />)
    fireEvent.click(screen.getByRole("link", { name: /applied jobs/i }))
    expect(screen.getAllByRole("article")).toHaveLength(10)
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getAllByRole("article")).toHaveLength(2)
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by read status" }), { target: { value: "unread" } })
    expect(screen.getByText("No unread jobs")).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by read status" }), { target: { value: "all" } })
    expect(screen.getAllByRole("article")).toHaveLength(10)
    expect(screen.getByRole("spinbutton", { name: "Current page" })).toHaveValue(1)
  })

  it("removes priority controls and moves dismissed jobs to Not interested with undo", async () => {
    render(<Harness initialLeads={[makeLead("new")]} />)
    expect(screen.queryByRole("tab", { name: /priority/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /priority/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Mark Engineer new as not interested" }))
    await waitFor(() => expect(screen.getByText("No job leads yet")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("link", { name: /not interested/i }))
    expect(window.location.hash).toBe("#not-interested")
    expect(screen.getByRole("heading", { name: "Not interested" })).toBeInTheDocument()
    expect(screen.getByRole("article", { name: "Engineer new" })).toHaveAttribute("data-read-state", "read")
    fireEvent.click(screen.getByRole("button", { name: "Restore Engineer new from not interested" }))
    await waitFor(() => expect(screen.getByText("No jobs marked not interested")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("link", { name: "Job leads" }))
    expect(screen.getByRole("article", { name: "Engineer new" })).toBeInTheDocument()
  })

  it("supports direct Not interested links and moves a dismissed job to Applied", async () => {
    window.history.replaceState(null, "", "#not-interested")
    render(<Harness initialLeads={[makeLead("dismissed", { is_read: true, not_interested_at: "2026-10-05T03:00:00Z" })]} />)
    expect(screen.getByRole("heading", { name: "Not interested" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Mark Engineer dismissed as applied" }))
    await waitFor(() => expect(screen.getByText("No jobs marked not interested")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("link", { name: /applied jobs/i }))
    expect(screen.getByRole("article", { name: "Engineer dismissed" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Mark Engineer dismissed as not interested" })).toHaveAttribute("aria-pressed", "false")
  })

  it("searches case-insensitively within each job status and keeps the query across views", () => {
    render(<Harness initialLeads={[
      makeLead("pending", { title: "Frontend Developer" }),
      makeLead("other", { title: "Backend Developer" }),
      makeLead("applied", { title: "Frontend Engineer Applied", applied_at: "2026-10-05T02:00:00Z" }),
      makeLead("dismissed", { title: "Frontend Engineer Dismissed", not_interested_at: "2026-10-05T03:00:00Z" }),
    ]} />)
    fireEvent.change(screen.getByRole("searchbox", { name: "Search jobs" }), { target: { value: "  FRONTEND  " } })
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByRole("article", { name: "Frontend Developer" })).toBeInTheDocument()
    expect(screen.getByText("1 job found")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: /applied jobs/i }))
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByRole("article", { name: "Frontend Engineer Applied" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: /not interested/i }))
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByRole("article", { name: "Frontend Engineer Dismissed" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: "Sync & cron" }))
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("link", { name: "Job leads" }))
    expect(screen.getByRole("searchbox", { name: "Search jobs" })).toHaveValue("  FRONTEND  ")
    expect(screen.getByRole("article", { name: "Frontend Developer" })).toBeInTheDocument()
  })

  it("searches companies and sources, combines read status, and clears empty results", () => {
    render(<Harness initialLeads={[
      makeLead("frontend", { title: "Frontend Developer", source: "onlinejobsph-email" }),
      makeLead("backend", { title: "Backend Developer", source: "ashby", company: "Acme", is_read: true }),
    ]} />)
    const search = screen.getByRole("searchbox", { name: "Search jobs" })
    fireEvent.change(search, { target: { value: "acme" } })
    expect(screen.getByRole("article", { name: "Backend Developer" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by read status" }), { target: { value: "unread" } })
    expect(screen.getByText("No matching jobs")).toBeInTheDocument()
    expect(screen.getByText("0 jobs found")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect(search).toHaveValue("")
    expect(search).toHaveFocus()
    expect(screen.getByRole("article", { name: "Frontend Developer" })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "OnlineJobs.ph" } })
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByRole("article", { name: "Frontend Developer" })).toBeInTheDocument()
    fireEvent.keyDown(search, { key: "Escape" })
    expect(search).toHaveValue("")
    expect(screen.getByRole("combobox", { name: "Filter by read status" })).toHaveValue("unread")
  })

  it("searches beyond the visible page and returns to page one when cleared", () => {
    render(<Harness initialLeads={Array.from({ length: 12 }, (_, index) => makeLead(`job-${String(index).padStart(2, "0")}`, {
      title: index === 11 ? "Hidden Target" : `Engineer ${index}`,
    }))} />)
    expect(screen.queryByRole("article", { name: "Hidden Target" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByRole("article", { name: "Hidden Target" })).toBeInTheDocument()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search jobs" }), { target: { value: "hidden target" } })
    expect(screen.getAllByRole("article")).toHaveLength(1)
    expect(screen.getByRole("article", { name: "Hidden Target" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Clear job search" }))
    expect(screen.getAllByRole("article")).toHaveLength(10)
    expect(screen.queryByRole("article", { name: "Hidden Target" })).not.toBeInTheDocument()
    expect(screen.getByRole("spinbutton", { name: "Current page" })).toHaveValue(1)
  })

  it("finds Smile & Hire by its display name and stored source name", () => {
    render(<Harness initialLeads={[
      makeLead("smile", { title: "AI Implementation Specialist (Client Systems Architect)", source: "smileandhire" }),
      makeLead("other", { title: "Automation Specialist", source: "onlinejobsph" }),
    ]} />)
    const search = screen.getByRole("searchbox", { name: "Search jobs" })
    for (const value of ["Smile & Hire", "smileandhire"]) {
      fireEvent.change(search, { target: { value } })
      expect(screen.getByText("1 job found")).toBeInTheDocument()
      expect(screen.getByRole("article", { name: "AI Implementation Specialist (Client Systems Architect)" })).toBeInTheDocument()
    }
  })
})
