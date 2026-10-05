import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { JobLeadCard } from "@/components/job-lead-card"
import type { JobLead } from "@/lib/database.types"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const lead: JobLead = {
  id: "lead-1",
  user_id: "user-1",
  title: "Senior Product Designer",
  description: "Own the end-to-end product experience.",
  url: "https://example.com/jobs/product-designer",
  source: "greenhouse",
  source_job_id: "lead-1",
  company: "Example",
  location: "Remote",
  is_remote: true,
  is_priority: false,
  is_read: false,
  applied_at: null,
  not_interested_at: null,
  source_timestamp_at: "2026-09-20T08:00:00.000Z",
  source_timestamp_kind: "published",
  source_timestamp_label: null,
  first_seen_at: "2026-09-20T08:05:00.000Z",
  last_seen_at: "2026-09-20T08:05:00.000Z",
  created_at: "2026-09-20T08:00:00.000Z",
  updated_at: "2026-09-20T08:00:00.000Z",
}

describe("JobLeadCard", () => {
  it("opens the job posting safely in a new tab", () => {
    const { container } = render(
      <JobLeadCard
        lead={lead}
        onSetNotInterested={vi.fn()}
        onSetRead={vi.fn()}
        onSetApplied={vi.fn()}
      />,
    )

    const link = screen.getByRole("link", { name: /open posting/i })
    expect(link).toHaveAttribute("href", lead.url)
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByText(lead.title)).toBeInTheDocument()
    const postedTime = container.querySelector("time")
    expect(postedTime?.parentElement).toHaveTextContent(
      "Posted Sep 20, 2026, 4:00 PM PHT",
    )
    expect(postedTime).toHaveAttribute(
      "datetime",
      lead.source_timestamp_at,
    )
    expect(screen.queryByText(lead.description)).not.toBeInTheDocument()
    expect(screen.queryByText("Example")).not.toBeInTheDocument()
    expect(screen.queryByText("Greenhouse")).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: `Edit ${lead.title}` }),
    ).not.toBeInTheDocument()
  })

  it("hides database actions in read-only previews", () => {
    render(
      <JobLeadCard
        lead={lead}
        onSetNotInterested={vi.fn()}
        onSetRead={vi.fn()}
        onSetApplied={vi.fn()}
        readOnly
      />,
    )

    expect(
      screen.queryByRole("button", { name: `Edit ${lead.title}` }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark.*as read/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /mark.*as applied/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: `Mark ${lead.title} as not interested`,
      }),
    ).not.toBeInTheDocument()
  })

  it("shows an approximate calendar date when only a provider-relative time is available", () => {
    const { container } = render(
      <JobLeadCard
        lead={{
          ...lead,
          source_timestamp_at: null,
          source_timestamp_kind: null,
          source_timestamp_label: "Reposted 2 days ago",
          last_seen_at: "2026-09-29T19:40:00.000Z",
        }}
        onSetNotInterested={vi.fn()}
        onSetRead={vi.fn()}
        onSetApplied={vi.fn()}
      />,
    )

    expect(screen.getByText("Approx. Sep 28, 2026")).toBeInTheDocument()
    expect(screen.queryByText(/reposted/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/first seen/i)).not.toBeInTheDocument()
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      "2026-09-27T19:40:00.000Z",
    )
  })

  it("shows only the exact time for a LinkedIn posting", () => {
    const { container } = render(
      <JobLeadCard
        lead={{
          ...lead,
          source: "linkedin-email",
        }}
        onSetNotInterested={vi.fn()}
        onSetRead={vi.fn()}
        onSetApplied={vi.fn()}
      />,
    )

    expect(container.querySelector("time")).toHaveTextContent(
      "Sep 20, 2026, 4:00 PM PHT",
    )
    expect(screen.queryByText(/posted sep/i)).not.toBeInTheDocument()
  })

  it("labels first-seen time when the provider posting date is unavailable", () => {
    const { container } = render(
      <JobLeadCard
        lead={{
          ...lead,
          source_timestamp_at: null,
          source_timestamp_kind: null,
          source_timestamp_label: null,
        }}
        onSetNotInterested={vi.fn()}
        onSetRead={vi.fn()}
        onSetApplied={vi.fn()}
      />,
    )

    expect(
      screen.getByText("First seen Sep 20, 2026, 4:05 PM PHT"),
    ).toBeInTheDocument()
    expect(container.querySelector("time")).toHaveAttribute(
      "datetime",
      lead.first_seen_at,
    )
    expect(screen.queryByText(/posted sep/i)).not.toBeInTheDocument()
  })

  it("marks a lead as not interested", async () => {
    const onSetNotInterested = vi.fn().mockResolvedValue(undefined)

    render(
      <JobLeadCard
        lead={lead}
        onSetNotInterested={onSetNotInterested}
        onSetRead={vi.fn()}
        onSetApplied={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: `Mark ${lead.title} as not interested`,
      }),
    )

    await waitFor(() =>
      expect(onSetNotInterested).toHaveBeenCalledWith(lead.id, true),
    )
  })

  it("marks a posting read when opened without preventing native navigation", async () => {
    const onSetRead = vi.fn().mockResolvedValue(undefined)
    render(<JobLeadCard lead={lead} onSetNotInterested={vi.fn()} onSetRead={onSetRead} onSetApplied={vi.fn()} />)
    expect(screen.getByRole("article")).toHaveAttribute("data-read-state", "unread")
    expect(fireEvent.click(screen.getByRole("link", { name: /open posting/i }))).toBe(true)
    await waitFor(() => expect(onSetRead).toHaveBeenCalledWith(lead.id, true))
  })

  it("does not rewrite read state when an already-read posting is opened", () => {
    const onSetRead = vi.fn()
    const { container } = render(<JobLeadCard lead={{ ...lead, is_read: true }} onSetNotInterested={vi.fn()} onSetRead={onSetRead} onSetApplied={vi.fn()} />)
    fireEvent.click(screen.getByRole("link", { name: /open posting/i }))
    expect(onSetRead).not.toHaveBeenCalled()
    expect(screen.getByRole("article")).toHaveAttribute("data-read-state", "read")
    expect(screen.getByText("Read")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="card"]')).toHaveClass("bg-slate-100/90")
  })

  it("allows a read job to be marked unread", async () => {
    const onSetRead = vi.fn().mockResolvedValue(undefined)
    render(<JobLeadCard lead={{ ...lead, is_read: true }} onSetNotInterested={vi.fn()} onSetRead={onSetRead} onSetApplied={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: `Mark ${lead.title} as unread` }))
    await waitFor(() => expect(onSetRead).toHaveBeenCalledWith(lead.id, false))
  })

  it("marks a job applied and allows removing that application", async () => {
    const onSetApplied = vi.fn().mockResolvedValue(undefined)
    const props = { onSetNotInterested: vi.fn(), onSetRead: vi.fn(), onSetApplied }
    const { rerender } = render(<JobLeadCard lead={lead} {...props} />)
    fireEvent.click(screen.getByRole("button", { name: `Mark ${lead.title} as applied` }))
    await waitFor(() => expect(onSetApplied).toHaveBeenCalledWith(lead.id, true))
    const appliedAt = "2026-10-05T03:00:00.000Z"
    rerender(<JobLeadCard lead={{ ...lead, is_read: true, applied_at: appliedAt }} {...props} />)
    expect(screen.getByText("Applied Oct 5, 2026, 11:00 AM PHT")).toHaveAttribute("datetime", appliedAt)
    fireEvent.click(screen.getByRole("button", { name: `Remove ${lead.title} from applied jobs` }))
    await waitFor(() => expect(onSetApplied).toHaveBeenLastCalledWith(lead.id, false))
  })

  it("shows failed status saves without claiming success", async () => {
    vi.mocked(toast.success).mockClear()
    const onSetApplied = vi.fn().mockRejectedValue(new Error("Database unavailable"))
    render(<JobLeadCard lead={lead} onSetNotInterested={vi.fn()} onSetRead={vi.fn()} onSetApplied={onSetApplied} />)
    fireEvent.click(screen.getByRole("button", { name: `Mark ${lead.title} as applied` }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Database unavailable"))
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: `Mark ${lead.title} as applied` })).toBeEnabled()
  })
})
