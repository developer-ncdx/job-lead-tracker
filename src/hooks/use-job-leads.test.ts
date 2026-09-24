import { act, renderHook, waitFor } from "@testing-library/react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import {
  sortJobLeadsByTimestamp,
  useJobLeads,
} from "@/hooks/use-job-leads"
import type {
  Database,
  JobLead,
  JobLeadUpdate,
} from "@/lib/database.types"

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

function createClientMock(fetchError: { message: string } | null = null) {
  const range = vi.fn().mockResolvedValue({
    data: fetchError ? null : [lead],
    error: fetchError,
  })
  const fetchBuilder = {
    eq: vi.fn(),
    order: vi.fn(),
    range,
  }
  fetchBuilder.eq.mockReturnValue(fetchBuilder)
  fetchBuilder.order.mockReturnValue(fetchBuilder)

  const updateMutation = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: lead.id },
      error: null,
    }),
  }
  updateMutation.eq.mockReturnValue(updateMutation)
  updateMutation.select.mockReturnValue(updateMutation)

  const deleteMutation = {
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: lead.id },
      error: null,
    }),
  }
  deleteMutation.eq.mockReturnValue(deleteMutation)
  deleteMutation.select.mockReturnValue(deleteMutation)

  const table = {
    select: vi.fn().mockReturnValue(fetchBuilder),
    update: vi.fn().mockReturnValue(updateMutation),
    delete: vi.fn().mockReturnValue(deleteMutation),
  }

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockReturnValue(channel)
  channel.subscribe.mockImplementation(
    (callback: (status: string) => void) => {
      callback("SUBSCRIBED")
      return channel
    },
  )

  const client = {
    from: vi.fn().mockReturnValue(table),
    channel: vi.fn().mockReturnValue(channel),
    removeChannel: vi.fn().mockResolvedValue("ok"),
  } as unknown as SupabaseClient<Database>

  return {
    client,
    table,
    range,
    fetchBuilder,
    updateMutation,
    deleteMutation,
  }
}

describe("useJobLeads", () => {
  it("uses first-seen time as the sorting fallback", () => {
    const newlyDiscoveredLead: JobLead = {
      ...lead,
      id: "lead-2",
      source_timestamp_at: null,
      source_timestamp_kind: null,
      first_seen_at: "2026-09-24T08:00:00.000Z",
      created_at: "2026-09-24T08:00:00.000Z",
    }

    expect(
      sortJobLeadsByTimestamp([lead, newlyDiscoveredLead]).map(
        ({ id }) => id,
      ),
    ).toEqual(["lead-2", "lead-1"])
  })

  it("fetches leads, then refetches after update and delete", async () => {
    const { client, table, range } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client, "user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.leads).toEqual([lead])
    expect(result.current.error).toBeNull()

    const update: JobLeadUpdate = {
      title: "Principal Product Designer",
      description: lead.description,
      url: lead.url,
    }

    await act(() => result.current.updateLead(lead.id, update))
    expect(table.update).toHaveBeenCalledWith(update)
    expect(range).toHaveBeenCalledTimes(2)

    await act(() => result.current.deleteLead(lead.id))
    expect(table.delete).toHaveBeenCalledOnce()
    expect(range).toHaveBeenCalledTimes(3)
  })

  it("does not add an owner filter in public mode", async () => {
    const {
      client,
      fetchBuilder,
      updateMutation,
      deleteMutation,
    } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchBuilder.eq).not.toHaveBeenCalled()

    await act(() =>
      result.current.updateLead(lead.id, {
        title: lead.title,
        description: lead.description,
        url: lead.url,
      }),
    )
    expect(updateMutation.eq).toHaveBeenCalledTimes(1)
    expect(updateMutation.eq).toHaveBeenCalledWith("id", lead.id)

    await act(() => result.current.deleteLead(lead.id))
    expect(deleteMutation.eq).toHaveBeenCalledTimes(1)
    expect(deleteMutation.eq).toHaveBeenCalledWith("id", lead.id)
  })

  it("surfaces failed fetches without throwing", async () => {
    const { client } = createClientMock({
      message: "Database unavailable",
    })
    const { result } = renderHook(() => useJobLeads(client, "user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.leads).toEqual([])
    expect(result.current.error).toBe("Database unavailable")
  })
})
