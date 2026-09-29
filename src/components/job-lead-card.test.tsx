import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { JobLeadCard } from "@/components/job-lead-card"
import type { JobLead } from "@/lib/database.types"

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
        onSetPriority={vi.fn()}
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
        onSetPriority={vi.fn()}
        readOnly
      />,
    )

    expect(
      screen.queryByRole("button", { name: `Edit ${lead.title}` }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: `Add ${lead.title} to priority`,
      }),
    ).not.toBeInTheDocument()
  })

  it("shows provider wording when an exact timestamp is unavailable", () => {
    render(
      <JobLeadCard
        lead={{
          ...lead,
          source_timestamp_at: null,
          source_timestamp_kind: null,
          source_timestamp_label: "Reposted 2 days ago",
        }}
        onSetPriority={vi.fn()}
      />,
    )

    expect(screen.getByText("Reposted 2 days ago")).toBeInTheDocument()
    expect(screen.queryByText(/first seen/i)).not.toBeInTheDocument()
  })

  it("does not present first-seen time as the provider posting date", () => {
    const { container } = render(
      <JobLeadCard
        lead={{
          ...lead,
          source_timestamp_at: null,
          source_timestamp_kind: null,
          source_timestamp_label: null,
        }}
        onSetPriority={vi.fn()}
      />,
    )

    expect(screen.queryByText(/first seen/i)).not.toBeInTheDocument()
    expect(container.querySelector("time")).not.toBeInTheDocument()
  })

  it("adds a lead to the priority list", async () => {
    const onSetPriority = vi.fn().mockResolvedValue(undefined)

    render(
      <JobLeadCard
        lead={lead}
        onSetPriority={onSetPriority}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: `Add ${lead.title} to priority`,
      }),
    )

    await waitFor(() =>
      expect(onSetPriority).toHaveBeenCalledWith(lead.id, true),
    )
  })
})
