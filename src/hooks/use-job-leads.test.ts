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
    is: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: lead.id },
      error: null,
    }),
  }
  updateMutation.eq.mockReturnValue(updateMutation)
  updateMutation.is.mockReturnValue(updateMutation)
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
    channel,
  }
}

describe("useJobLeads", () => {
  it("fetches list metadata without downloading full job descriptions", async () => {
    const { client, table } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const columns = table.select.mock.calls[0][0].split(",")
    expect(columns).not.toContain("*")
    expect(columns).not.toContain("description")
    expect(columns).toEqual(expect.arrayContaining(["title", "url", "is_read", "applied_at", "not_interested_at", "source", "source_timestamp_at"]))
    expect(result.current.leads[0].description).toBe("")
    expect(result.current.leads[0].title).toBe(lead.title)
  })
  it("downloads leads once after a burst of Realtime updates and includes the final change", async () => {
    const { client, range, channel } = createClientMock()
    const { result, unmount } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const onChange = channel.on.mock.calls[0][2] as () => void
    vi.useFakeTimers()
    try {
      range.mockResolvedValue({ data: [{ ...lead, title: "Updated after sync" }], error: null })
      await act(async () => {
        for (let index = 0; index < 100; index++) onChange()
        await vi.advanceTimersByTimeAsync(900)
        onChange()
        await vi.advanceTimersByTimeAsync(900)
      })
      expect(range).toHaveBeenCalledTimes(1)
      await act(async () => { await vi.advanceTimersByTimeAsync(100) })
      expect(range).toHaveBeenCalledTimes(2)
      expect(result.current.leads[0].title).toBe("Updated after sync")
    } finally {
      unmount()
      vi.useRealTimers()
    }
  })

  it("cancels queued Realtime refreshes when the hook unmounts", async () => {
    const { client, range, channel } = createClientMock()
    const { result, unmount } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const onChange = channel.on.mock.calls[0][2] as () => void
    vi.useFakeTimers()
    try {
      act(() => onChange())
      unmount()
      onChange()
      await vi.advanceTimersByTimeAsync(2000)
      expect(range).toHaveBeenCalledTimes(1)
      expect(client.removeChannel).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it("sorts by the provider posting date, not discovery time", () => {
    const olderPosting: JobLead = {
      ...lead,
      id: "older-posting",
      first_seen_at: "2026-09-30T08:00:00.000Z",
      created_at: "2026-09-30T08:00:00.000Z",
    }
    const newerPosting: JobLead = {
      ...lead,
      id: "newer-posting",
      source_timestamp_at: "2026-09-25T08:00:00.000Z",
    }
    const undated: JobLead = {
      ...lead,
      id: "undated",
      source_timestamp_at: null,
      source_timestamp_kind: null,
      first_seen_at: "2026-09-30T09:00:00.000Z",
      created_at: "2026-09-30T09:00:00.000Z",
    }

    expect(
      sortJobLeadsByTimestamp([
        olderPosting,
        undated,
        newerPosting,
      ]).map(({ id }) => id),
    ).toEqual(["newer-posting", "older-posting", "undated"])
    expect(
      sortJobLeadsByTimestamp(
        [olderPosting, undated, newerPosting],
        "oldest",
      ).map(({ id }) => id),
    ).toEqual(["older-posting", "newer-posting", "undated"])
  })

  it("sorts approximate provider posting dates alongside exact ones", () => {
    const relativePosting: JobLead = {
      ...lead,
      id: "relative-posting",
      source_timestamp_at: null,
      source_timestamp_kind: null,
      source_timestamp_label: "3 days ago",
      last_seen_at: "2026-09-30T08:00:00.000Z",
      first_seen_at: "2026-09-30T08:00:00.000Z",
    }
    const newerPosting: JobLead = {
      ...lead,
      id: "newer-posting",
      source_timestamp_at: "2026-09-29T08:00:00.000Z",
    }

    expect(
      sortJobLeadsByTimestamp([
        relativePosting,
        lead,
        newerPosting,
      ]).map(({ id }) => id),
    ).toEqual(["newer-posting", "relative-posting", "lead-1"])
    expect(
      sortJobLeadsByTimestamp(
        [relativePosting, lead, newerPosting],
        "oldest",
      ).map(({ id }) => id),
    ).toEqual(["lead-1", "relative-posting", "newer-posting"])
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

  it("saves read state and updates the local card without downloading all leads", async () => {
    const { client, table, range, updateMutation } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client, "user-1"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.setRead(lead.id, true))
    expect(table.update).toHaveBeenCalledWith({ is_read: true })
    expect(updateMutation.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(result.current.leads[0].is_read).toBe(true)
    expect(range).toHaveBeenCalledTimes(1)
    await act(() => result.current.setRead(lead.id, false))
    expect(result.current.leads[0].is_read).toBe(false)
  })

  it("saves application time, marks the job read, and supports undo", async () => {
    const { client, table, updateMutation } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.setApplied(lead.id, true))
    expect(table.update).toHaveBeenCalledWith({ applied_at: expect.any(String), not_interested_at: null, is_read: true })
    expect(updateMutation.is).toHaveBeenCalledWith("user_id", null)
    expect(result.current.leads[0].applied_at).not.toBeNull()
    expect(result.current.leads[0].is_read).toBe(true)
    await act(() => result.current.setApplied(lead.id, false))
    expect(table.update).toHaveBeenLastCalledWith({ applied_at: null })
    expect(result.current.leads[0].applied_at).toBeNull()
    expect(result.current.leads[0].is_read).toBe(true)
  })

  it("saves dismissals, clears applications, and supports undo and applying later", async () => {
    const { client, table, updateMutation, range } = createClientMock()
    range.mockResolvedValue({ data: [{ ...lead, applied_at: "2026-10-05T03:00:00Z" }], error: null })
    const { result } = renderHook(() => useJobLeads(client, "user-1"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(() => result.current.setNotInterested(lead.id, true))
    expect(table.update).toHaveBeenLastCalledWith({ not_interested_at: expect.any(String), applied_at: null, is_read: true })
    expect(updateMutation.eq).toHaveBeenCalledWith("user_id", "user-1")
    expect(result.current.leads[0].not_interested_at).not.toBeNull()
    expect(result.current.leads[0].applied_at).toBeNull()
    await act(() => result.current.setNotInterested(lead.id, false))
    expect(table.update).toHaveBeenLastCalledWith({ not_interested_at: null })
    expect(result.current.leads[0].not_interested_at).toBeNull()
    expect(result.current.leads[0].is_read).toBe(true)
    await act(() => result.current.setNotInterested(lead.id, true))
    await act(() => result.current.setApplied(lead.id, true))
    expect(result.current.leads[0].applied_at).not.toBeNull()
    expect(result.current.leads[0].not_interested_at).toBeNull()
    expect(range).toHaveBeenCalledTimes(1)
  })

  it("does not dismiss a job when the database rejects the update", async () => {
    const { client, updateMutation } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    updateMutation.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "Dismissal failed" } })
    await act(async () => { await expect(result.current.setNotInterested(lead.id, true)).rejects.toThrow("Dismissal failed") })
    expect(result.current.leads[0].not_interested_at).toBeNull()
    expect(result.current.leads[0].is_read).toBe(false)
  })

  it.each([
    { data: null, error: { message: "Status write failed" }, message: "Status write failed" },
    { data: null, error: null, message: "This lead is no longer available" },
  ])("does not change tracking state when a write fails: $message", async ({ data, error, message }) => {
    const { client, updateMutation } = createClientMock()
    const { result } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    updateMutation.maybeSingle.mockResolvedValueOnce({ data, error })
    await act(async () => { await expect(result.current.setApplied(lead.id, true)).rejects.toThrow(message) })
    expect(result.current.leads[0].applied_at).toBeNull()
    expect(result.current.leads[0].is_read).toBe(false)
  })

  it("restores saved tracking states on reload", async () => {
    const { client, range } = createClientMock()
    const saved = { ...lead, is_read: true, applied_at: "2026-10-05T03:00:00.000Z" }
    range.mockResolvedValue({ data: [saved], error: null })
    const { result } = renderHook(() => useJobLeads(client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.leads[0]).toEqual({ ...saved, description: "" })
  })
})
