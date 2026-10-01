import { useCallback, useEffect, useRef, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, JobSyncRun } from "@/lib/database.types"

type HistoryState = {
  ownerId: string | null
  runs: JobSyncRun[]
  latestCron: JobSyncRun | null
  lastSuccess: JobSyncRun | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  missingMigration: boolean
  checkedAt: string | null
}
const emptyState = (ownerId: string | null): HistoryState => ({
  ownerId,
  runs: [],
  latestCron: null,
  lastSuccess: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
  missingMigration: false,
  checkedAt: null,
})

export function useSyncHistory(
  client: SupabaseClient<Database>,
  ownerId: string | null = null,
) {
  const [state, setState] = useState<HistoryState>(() => emptyState(ownerId))
  const requestId = useRef(0)
  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setState((previous) => ({
      ...(previous.ownerId === ownerId ? previous : emptyState(ownerId)),
      isRefreshing: true,
    }))
    const query = () => {
      const table = client.from("job_sync_runs").select("*")
      return ownerId ? table.eq("user_id", ownerId) : table.is("user_id", null)
    }
    try {
      const [recent, cron, success] = await Promise.all([
        query().order("started_at", { ascending: false }).limit(20),
        query()
          .eq("trigger", "scheduled_cron")
          .order("started_at", { ascending: false })
          .limit(1),
        query()
          .in("status", ["success", "warning"])
          .order("finished_at", { ascending: false, nullsFirst: false })
          .limit(1),
      ])
      const error = recent.error ?? cron.error ?? success.error
      if (error) throw error
      if (id !== requestId.current) return
      setState({
        ownerId,
        runs: recent.data ?? [],
        latestCron: cron.data?.[0] ?? null,
        lastSuccess: success.data?.[0] ?? null,
        isLoading: false,
        isRefreshing: false,
        error: null,
        missingMigration: false,
        checkedAt: new Date().toISOString(),
      })
    } catch (error) {
      if (id !== requestId.current) return
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null
      const missingMigration = code === "PGRST205" || code === "42P01"
      setState((previous) => ({
        ...(previous.ownerId === ownerId ? previous : emptyState(ownerId)),
        isLoading: false,
        isRefreshing: false,
        missingMigration,
        error: missingMigration
          ? "Run history is not enabled yet. Apply the job_sync_health database migration, then deploy the updated sync code."
          : "Could not check sync health. Refresh status to try again; previous results may be stale.",
      }))
    }
  }, [client, ownerId])

  useEffect(() => {
    // This effect intentionally synchronizes the status tab with server history.
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh()
    const poll = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    const timer = setInterval(poll, 60_000)
    document.addEventListener("visibilitychange", poll)
    return () => {
      requestId.current += 1
      clearInterval(timer)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [refresh])
  return {
    ...(state.ownerId === ownerId ? state : emptyState(ownerId)),
    refresh,
  }
}
