import { act, renderHook, waitFor } from "@testing-library/react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"
import type { Database } from "@/lib/database.types"
import { useSyncHistory } from "@/hooks/use-sync-history"
import { makeSyncRun } from "@/test/sync-fixtures"

function mockClient() {
  let failure: { code: string } | null = null
  const scopes: unknown[] = []
  const cron = makeSyncRun({ id: "cron", status: "failed" })
  const local = makeSyncRun({ id: "local", trigger: "local_sync" })
  const queries: Array<{
    owner: unknown
    trigger?: string
    success?: boolean
  }> = []
  const client = {
    from: vi.fn(() => {
      const filters: { owner: unknown; trigger?: string; success?: boolean } = {
        owner: undefined,
      }
      queries.push(filters)
      const query = {
        select: () => query,
        order: vi.fn().mockImplementation(() => query),
        eq: (key: string, value: string) => {
          if (key === "user_id") {
            filters.owner = value
            scopes.push(value)
          } else if (key === "trigger") filters.trigger = value
          return query
        },
        is: (_key: string, value: null) => {
          filters.owner = value
          scopes.push(value)
          return query
        },
        in: () => {
          filters.success = true
          return query
        },
        limit: async () => ({
          data: filters.trigger ? [cron] : filters.success ? [local] : [local],
          error: failure,
        }),
      }
      return query
    }),
  } as unknown as SupabaseClient<Database>
  return {
    client,
    scopes,
    queries,
    setFailure: (value: { code: string }) => {
      failure = value
    },
  }
}

describe("sync-history reader", () => {
  it("loads the last cron separately so many local runs cannot hide it", async () => {
    const mock = mockClient()
    const { result } = renderHook(() => useSyncHistory(mock.client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.runs[0].trigger).toBe("local_sync")
    expect(result.current.latestCron?.id).toBe("cron")
    expect(result.current.lastSuccess?.id).toBe("local")
    expect(mock.scopes).toEqual([null, null, null])
  })
  it("scopes all authenticated queries to the current owner", async () => {
    const mock = mockClient()
    const { result } = renderHook(() => useSyncHistory(mock.client, "owner-1"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mock.scopes).toEqual(["owner-1", "owner-1", "owner-1"])
  })
  it("shows actionable migration instructions for a missing table", async () => {
    const mock = mockClient()
    mock.setFailure({ code: "PGRST205" })
    const { result } = renderHook(() => useSyncHistory(mock.client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.missingMigration).toBe(true)
    expect(result.current.error).toContain("job_sync_health")
    expect(result.current.latestCron).toBeNull()
  })
  it("retains last loaded history but flags transient refresh errors", async () => {
    const mock = mockClient()
    const { result } = renderHook(() => useSyncHistory(mock.client))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    mock.setFailure({ code: "NETWORK" })
    await act(async () => result.current.refresh())
    expect(result.current.latestCron?.id).toBe("cron")
    expect(result.current.error).toContain("stale")
  })
  it("does not keep another owner's data when the new scope fails to load", async () => {
    const mock = mockClient()
    const { result, rerender } = renderHook(
      ({ owner }) => useSyncHistory(mock.client, owner),
      { initialProps: { owner: "owner-1" } },
    )
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    mock.setFailure({ code: "NETWORK" })
    rerender({ owner: "owner-2" })
    expect(result.current.runs).toEqual([])
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.latestCron).toBeNull()
    expect(result.current.lastSuccess).toBeNull()
  })
})
