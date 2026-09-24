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
  source_timestamp_at: "2026-09-20T08:00:00.000Z",
  source_timestamp_kind: "published",
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
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    const link = screen.getByRole("link", { name: /open posting/i })
    expect(link).toHaveAttribute("href", lead.url)
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.getByText(lead.title)).toBeInTheDocument()
    const postedTime = container.querySelector("time")
    expect(postedTime?.parentElement).toHaveTextContent("Posted")
    expect(postedTime).toHaveAttribute(
      "datetime",
      lead.source_timestamp_at,
    )
    expect(screen.queryByText(lead.description)).not.toBeInTheDocument()
    expect(screen.queryByText("Example")).not.toBeInTheDocument()
    expect(screen.queryByText("Greenhouse")).not.toBeInTheDocument()
  })

  it("hides database actions in read-only previews", () => {
    render(
      <JobLeadCard
        lead={lead}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        readOnly
      />,
    )

    expect(
      screen.queryByRole("button", { name: `Edit ${lead.title}` }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: `Delete ${lead.title}` }),
    ).not.toBeInTheDocument()
  })

  it("validates and saves edited lead details", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined)

    render(
      <JobLeadCard
        lead={lead}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: `Edit ${lead.title}`,
      }),
    )

    const title = await screen.findByLabelText("Title")
    const url = screen.getByLabelText("Job posting URL")
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument()
    fireEvent.change(title, { target: { value: "  Lead Designer  " } })
    fireEvent.change(url, { target: { value: "not-a-url" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    expect(
      await screen.findByText(
        "Use a complete URL starting with http:// or https://.",
      ),
    ).toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()

    fireEvent.change(url, {
      target: { value: " https://example.com/jobs/lead-designer " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(lead.id, {
        title: "Lead Designer",
        description: lead.description,
        url: "https://example.com/jobs/lead-designer",
      }),
    )
  })

  it("requires confirmation before deleting", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)

    render(
      <JobLeadCard
        lead={lead}
        onUpdate={vi.fn()}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: `Delete ${lead.title}`,
      }),
    )

    expect(await screen.findByText("Delete this lead?")).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Delete lead" }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(lead.id))
  })
})
