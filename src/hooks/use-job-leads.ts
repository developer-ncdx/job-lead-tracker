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

type LeadTrackingUpdate = Pick<
  Database["public"]["Tables"]["job_leads"]["Update"],
  "is_read" | "applied_at" | "not_interested_at"
>

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
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
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
          if (disposed) return
          // Syncs update many rows in a burst. Reload once after the burst,
          // instead of downloading the entire lead list for every row.
          clearTimeout(refreshTimer)
          refreshTimer = setTimeout(() => {
            refreshTimer = undefined
            void fetchLeads({ background: true })
          }, 1000)
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
      clearTimeout(refreshTimer)
      void client.removeChannel(channel)
    }
  }, [client, fetchLeads, userId])

  const refresh = useCallback(
    () => fetchLeads({ background: true }),
    [fetchLeads],
  )

  const updateTracking = useCallback(
    async (leadId: string, changes: LeadTrackingUpdate) => {
      let query = client.from("job_leads").update(changes).eq("id", leadId)
      query = userId ? query.eq("user_id", userId) : query.is("user_id", null)

      const { data, error: updateError } = await query
        .select("id")
        .maybeSingle()
      if (updateError) {
        throw new Error(
          getErrorMessage(
            updateError,
            "We could not save this job's tracking status. Please try again.",
          ),
        )
      }
      if (!data) {
        throw new Error(
          "This lead is no longer available. Refresh to load the latest results.",
        )
      }

      // Update only the changed fields, without downloading every lead again.
      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId ? { ...lead, ...changes } : lead,
        ),
      )
    },
    [client, userId],
  )

  const setRead = useCallback(
    (leadId: string, isRead: boolean) =>
      updateTracking(leadId, { is_read: isRead }),
    [updateTracking],
  )

  const setApplied = useCallback(
    (leadId: string, isApplied: boolean) =>
      updateTracking(
        leadId,
        isApplied
          ? { applied_at: new Date().toISOString(), not_interested_at: null, is_read: true }
          : { applied_at: null },
      ),
    [updateTracking],
  )

  const setNotInterested = useCallback(
    (leadId: string, isNotInterested: boolean) =>
      updateTracking(
        leadId,
        isNotInterested
          ? { not_interested_at: new Date().toISOString(), applied_at: null, is_read: true }
          : { not_interested_at: null },
      ),
    [updateTracking],
  )

  return {
    leads,
    isLoading,
    isRefreshing,
    error,
    realtimeWarning,
    lastSyncedAt,
    refresh,
    setNotInterested,
    setRead,
    setApplied,
  }
}
