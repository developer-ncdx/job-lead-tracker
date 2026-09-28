import { act, renderHook, waitFor } from "@testing-library/react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import {
  sortJobLeadsByTimestamp,
  useJobLeads,
} from "@/hooks/use-job-leads"
import type { Database, JobLead } from "@/lib/database.types"

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

  const table = {
    select: vi.fn().mockReturnValue(fetchBuilder),
    update: vi.fn().mockReturnValue(updateMutation),
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
    expect(
      sortJobLeadsByTimestamp(
        [lead, newlyDiscoveredLead],
        "oldest",
      ).map(({ id }) => id),
    ).toEqual(["lead-1", "lead-2"])
  })

  it("fetches leads, then refetches after setting priority", async () => {
    const { client, table, range } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client, "user-1"))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.leads).toEqual([lead])
    expect(result.current.error).toBeNull()

    await act(() => result.current.setPriority(lead.id, true))
    expect(table.update).toHaveBeenCalledWith({ is_priority: true })
    expect(range).toHaveBeenCalledTimes(2)
  })

  it("does not add an owner filter in public mode", async () => {
    const {
      client,
      fetchBuilder,
      updateMutation,
    } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(fetchBuilder.eq).not.toHaveBeenCalled()

    await act(() =>
      result.current.setPriority(lead.id, true),
    )
    expect(updateMutation.eq).toHaveBeenCalledTimes(1)
    expect(updateMutation.eq).toHaveBeenCalledWith("id", lead.id)
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
