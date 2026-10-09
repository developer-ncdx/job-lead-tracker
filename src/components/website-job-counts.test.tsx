import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { WebsiteJobCounts } from "@/components/website-job-counts"
import type { JobLead } from "@/lib/database.types"

function makeLead(id: string, values: Partial<JobLead> = {}): JobLead {
  return {
    id,
    user_id: null,
    title: `Job ${id}`,
    description: "",
    url: `https://www.onlinejobs.ph/jobseekers/job/${id}`,
    source: "onlinejobsph",
    source_job_id: id,
    company: "Example company",
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

describe("website job drawers", () => {
  it("lists only the selected website, combining email imports and every tracking state", () => {
    const jobs = [
      makeLead("available"),
      makeLead("applied", { source: "onlinejobsph-email", applied_at: "2026-10-05T01:00:00Z" }),
      makeLead("dismissed", { not_interested_at: "2026-10-05T01:00:00Z" }),
      makeLead("smile", { source: "smileandhire", url: "https://www.smileandhire.com/jobs/1" }),
    ]
    render(<WebsiteJobCounts leads={jobs} isLoading={false} error={null} />)
    fireEvent.click(screen.getByRole("button", { name: "View 3 jobs from onlinejobs.ph" }))

    const drawer = screen.getByRole("dialog", { name: "onlinejobs.ph jobs" })
    expect(within(drawer).getByText("3 saved jobs · Latest acquired first")).toBeInTheDocument()
    expect(within(drawer).getAllByRole("listitem")).toHaveLength(3)
    expect(within(drawer).getByText("Applied")).toBeInTheDocument()
    expect(within(drawer).getByText("Not interested")).toBeInTheDocument()
    expect(within(drawer).getByText("Job lead")).toBeInTheDocument()
    expect(within(drawer).queryByText("Job smile")).not.toBeInTheDocument()
    const posting = within(drawer).getByRole("link", { name: "Job applied" })
    expect(posting).toHaveAttribute("href", jobs[1].url)
    expect(posting).toHaveAttribute("target", "_blank")
    expect(posting).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("paginates latest acquired jobs first and resets the page when opening another website or reopening", async () => {
    const jobs = Array.from({ length: 23 }, (_, index) => makeLead(String(index), {
      source_timestamp_at: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
      first_seen_at: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    }))
    jobs.push(makeLead("smile", { source: "smileandhire" }))
    render(<WebsiteJobCounts leads={jobs} isLoading={false} error={null} />)
    const onlineJobs = screen.getByRole("button", { name: "View 23 jobs from onlinejobs.ph" })
    fireEvent.click(onlineJobs)
    let drawer = screen.getByRole("dialog")
    expect(within(drawer).getAllByRole("link")[0]).toHaveTextContent("Job 22")
    expect(within(drawer).getAllByRole("listitem")).toHaveLength(20)
    expect(within(drawer).getByRole("status")).toHaveTextContent("1–20 of 23")
    expect(within(drawer).getByRole("button", { name: "Previous jobs" })).toBeDisabled()

    fireEvent.click(within(drawer).getByRole("button", { name: "Next jobs" }))
    expect(within(drawer).getAllByRole("listitem")).toHaveLength(3)
    expect(within(drawer).getByRole("status")).toHaveTextContent("21–23 of 23")
    expect(within(drawer).getByRole("button", { name: "Next jobs" })).toBeDisabled()
    fireEvent.click(within(drawer).getByRole("button", { name: "Previous jobs" }))
    expect(within(drawer).getByRole("status")).toHaveTextContent("1–20 of 23")
    fireEvent.click(within(drawer).getByRole("button", { name: "Next jobs" }))
    fireEvent.click(within(drawer).getByRole("button", { name: "Close job drawer" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "View 1 job from smileandhire.com" }))
    drawer = screen.getByRole("dialog", { name: "smileandhire.com jobs" })
    expect(within(drawer).getByRole("status")).toHaveTextContent("1–1 of 1")
    expect(within(drawer).getByRole("link", { name: "Job smile" })).toBeInTheDocument()
    expect(within(drawer).queryByRole("navigation")).not.toBeInTheDocument()
    fireEvent.click(within(drawer).getByRole("button", { name: "Close job drawer" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    fireEvent.click(onlineJobs)
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("1–20 of 23")
  })

  it("orders by first acquisition rather than provider dates or subsequent sync refreshes", () => {
    const jobs = [
      makeLead("older", { first_seen_at: "2026-10-05T00:00:00Z", source_timestamp_at: "2026-10-09T00:00:00Z", last_seen_at: "2026-10-10T00:00:00Z" }),
      makeLead("newest", { first_seen_at: "2026-10-09T13:01:00Z", source_timestamp_at: null, source_timestamp_label: "Updated Oct 5, 2026" }),
      makeLead("middle", { first_seen_at: "2026-10-08T00:00:00Z", source_timestamp_at: "2026-05-31T00:00:00Z" }),
    ]
    render(<WebsiteJobCounts leads={jobs} isLoading={false} error={null} />)
    fireEvent.click(screen.getByRole("button", { name: "View 3 jobs from onlinejobs.ph" }))
    const drawer = screen.getByRole("dialog")
    expect(within(drawer).getAllByRole("link").map(link => link.textContent?.trim())).toEqual(["Job newest", "Job middle", "Job older"])
    expect(within(drawer).getByText("Updated Oct 5, 2026")).toBeInTheDocument()
    expect(jobs.map(job => job.id)).toEqual(["older", "newest", "middle"])
  })

  it("closes with Escape and returns keyboard focus to the website that opened it", async () => {
    render(<WebsiteJobCounts leads={[makeLead("online"), makeLead("smile", { source: "smileandhire" })]} isLoading={false} error={null} />)
    const trigger = screen.getByRole("button", { name: "View 1 job from onlinejobs.ph" })
    trigger.focus()
    fireEvent.click(trigger)
    expect(screen.getByRole("button", { name: "Close job drawer" })).toHaveFocus()
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })
})
