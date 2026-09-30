import { useCallback, useEffect, useRef, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  Database,
  JobLead,
} from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
import { estimateRelativeDate } from "@/lib/philippine-time"

type FetchOptions = {
  background?: boolean
}

const PAGE_SIZE = 500

function postingTimestamp(lead: JobLead) {
  if (lead.source_timestamp_at) {
    const timestamp = Date.parse(lead.source_timestamp_at)
    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return lead.source_timestamp_label
    ? estimateRelativeDate(
        lead.source_timestamp_label,
        lead.last_seen_at,
      )?.getTime() ?? null
    : null
}

export type JobLeadSortOrder = "newest" | "oldest"

export function sortJobLeadsByTimestamp(
  leads: JobLead[],
  sortOrder: JobLeadSortOrder = "newest",
) {
  return [...leads].sort((left, right) => {
    const rightTimestamp = postingTimestamp(right)
    const leftTimestamp = postingTimestamp(left)

    if (leftTimestamp === null || rightTimestamp === null) {
      if (leftTimestamp === null && rightTimestamp === null) {
        return left.id.localeCompare(right.id)
      }

      return leftTimestamp === null ? 1 : -1
    }

    return sortOrder === "newest"
      ? rightTimestamp - leftTimestamp || left.id.localeCompare(right.id)
      : leftTimestamp - rightTimestamp || left.id.localeCompare(right.id)
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
            .select("*")

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

  const setPriority = useCallback(
    async (leadId: string, isPriority: boolean) => {
      let query = client
        .from("job_leads")
        .update({ is_priority: isPriority })
        .eq("id", leadId)

      if (userId) {
        query = query.eq("user_id", userId)
      }

      const { data, error: priorityError } = await query
        .select("id")
        .maybeSingle()

      if (priorityError) {
        throw new Error(
          getErrorMessage(
            priorityError,
            "We could not update this lead's priority. Please try again.",
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
    setPriority,
  }
}
