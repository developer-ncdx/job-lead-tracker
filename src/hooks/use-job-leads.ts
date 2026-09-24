import { useCallback, useEffect, useRef, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Database,
  JobLead,
  JobLeadUpdate,
} from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"

type FetchOptions = {
  background?: boolean
}

const PAGE_SIZE = 500

function parseTimestamp(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (!value) {
      continue
    }

    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return 0
}

export function sortJobLeadsByTimestamp(leads: JobLead[]) {
  return [...leads].sort((left, right) => {
    const rightTimestamp = parseTimestamp(
      right.source_timestamp_at,
      right.first_seen_at,
      right.created_at,
    )
    const leftTimestamp = parseTimestamp(
      left.source_timestamp_at,
      left.first_seen_at,
      left.created_at,
    )

    return rightTimestamp - leftTimestamp || right.id.localeCompare(left.id)
  })
}

export function useJobLeads(
  client: SupabaseClient<Database>,
  userId: string | null = null,
) {
  const [leads, setLeads] = useState<JobLead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeWarning, setRealtimeWarning] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const requestIdRef = useRef(0)

  const fetchLeads = useCallback(
    async ({ background = false }: FetchOptions = {}) => {
      const requestId = ++requestIdRef.current

      if (background) {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }

      try {
        const loadedLeads: JobLead[] = []

        for (let offset = 0; ; offset += PAGE_SIZE) {
          let query = client
            .from("job_leads")
            .select(
              "id, user_id, title, description, url, source, source_job_id, company, location, is_remote, source_timestamp_at, source_timestamp_kind, first_seen_at, last_seen_at, created_at, updated_at",
            )

          if (userId) {
            query = query.eq("user_id", userId)
          }

          const { data, error: fetchError } = await query
            .order("source_timestamp_at", {
              ascending: false,
              nullsFirst: false,
            })
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1)

          if (fetchError) {
            throw fetchError
          }

          if (requestId !== requestIdRef.current) {
            return
          }

          loadedLeads.push(...(data ?? []))

          if (!data || data.length < PAGE_SIZE) {
            break
          }
        }

        if (requestId !== requestIdRef.current) {
          return
        }

        setLeads(sortJobLeadsByTimestamp(loadedLeads))
        setError(null)
        setLastSyncedAt(new Date())
      } catch (fetchError) {
        if (requestId === requestIdRef.current) {
          setError(
            getErrorMessage(
              fetchError,
              "We could not load your job leads. Please try again.",
            ),
          )
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    },
    [client, userId],
  )

  useEffect(() => {
    // This effect intentionally synchronizes React with the remote lead store.
    // oxlint-disable-next-line react/set-state-in-effect
    void fetchLeads()

    return () => {
      requestIdRef.current += 1
    }
  }, [fetchLeads])

  useEffect(() => {
    let disposed = false
    const channel = client
      .channel(`job-leads:${userId ?? "public"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_leads",
        },
        () => {
          void fetchLeads({ background: true })
        },
      )
      .subscribe((status) => {
        if (disposed) {
          return
        }

        if (status === "SUBSCRIBED") {
          setRealtimeWarning(null)
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeWarning(
            "Live updates are temporarily unavailable. Use Refresh to check for new leads.",
          )
        }
      })

    return () => {
      disposed = true
      void client.removeChannel(channel)
    }
  }, [client, fetchLeads, userId])

  const refresh = useCallback(
    () => fetchLeads({ background: true }),
    [fetchLeads],
  )

  const updateLead = useCallback(
    async (leadId: string, values: JobLeadUpdate) => {
      let query = client
        .from("job_leads")
        .update(values)
        .eq("id", leadId)

      if (userId) {
        query = query.eq("user_id", userId)
      }

      const { data, error: updateError } = await query
        .select("id")
        .maybeSingle()

      if (updateError) {
        throw new Error(
          getErrorMessage(
            updateError,
            "We could not update this lead. Please try again.",
          ),
        )
      }

      if (!data) {
        throw new Error(
          "This lead is no longer available. Refresh to load the latest results.",
        )
      }

      await fetchLeads({ background: true })
    },
    [client, fetchLeads, userId],
  )

  const deleteLead = useCallback(
    async (leadId: string) => {
      let query = client
        .from("job_leads")
        .delete()
        .eq("id", leadId)

      if (userId) {
        query = query.eq("user_id", userId)
      }

      const { data, error: deleteError } = await query
        .select("id")
        .maybeSingle()

      if (deleteError) {
        throw new Error(
          getErrorMessage(
            deleteError,
            "We could not delete this lead. Please try again.",
          ),
        )
      }

      if (!data) {
        throw new Error(
          "This lead is no longer available. Refresh to load the latest results.",
        )
      }

      await fetchLeads({ background: true })
    },
    [client, fetchLeads, userId],
  )

  return {
    leads,
    isLoading,
    isRefreshing,
    error,
    realtimeWarning,
    lastSyncedAt,
    refresh,
    updateLead,
    deleteLead,
  }
}
