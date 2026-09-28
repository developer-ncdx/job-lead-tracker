import { useMemo, useState } from "react"
import type { Session, SupabaseClient } from "@supabase/supabase-js"
import {
  ArrowDownUp,
  BriefcaseBusiness,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Star,
} from "lucide-react"
import { toast } from "sonner"

import { JobLeadList } from "@/components/job-lead-list"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { Database, JobLead } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
import { formatPhilippineTime } from "@/lib/philippine-time"
import {
  sortJobLeadsByTimestamp,
  useJobLeads,
  type JobLeadSortOrder,
} from "@/hooks/use-job-leads"

type LeadDashboardProps = {
  client: SupabaseClient<Database>
  session: Session
}

type PublicLeadDashboardProps = {
  client: SupabaseClient<Database>
}

type DashboardViewProps = {
  leads: JobLead[]
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  realtimeWarning: string | null
  lastSyncedAt: Date | null
  userLabel: string
  headerBadgeLabel?: string
  isSigningOut?: boolean
  isPreview?: boolean
  onSignOut?: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
  onSetPriority: (leadId: string, isPriority: boolean) => Promise<void>
}

const previewLeads: JobLead[] = [
  {
    id: "preview-ai-engineer",
    user_id: "preview-user",
    title: "Senior AI Engineer",
    description:
      "Build production AI agents and automation workflows for a remote product team.",
    url: "https://example.com/jobs/senior-ai-engineer",
    source: "ashby",
    source_job_id: "preview-ai-engineer",
    company: "Example AI",
    location: "Remote — Worldwide",
    is_remote: true,
    is_priority: true,
    source_timestamp_at: "2026-09-23T12:30:00.000Z",
    source_timestamp_kind: "published",
    first_seen_at: "2026-09-23T12:35:00.000Z",
    last_seen_at: "2026-09-23T12:35:00.000Z",
    created_at: "2026-09-23T12:30:00.000Z",
    updated_at: "2026-09-23T12:30:00.000Z",
  },
  {
    id: "preview-lead-programmer",
    user_id: "preview-user",
    title: "Lead Programmer",
    description:
      "Lead a small engineering team delivering customer-facing web applications.",
    url: "https://example.com/jobs/lead-programmer",
    source: "greenhouse",
    source_job_id: "preview-lead-programmer",
    company: "Example Labs",
    location: "Manila, Philippines",
    is_remote: false,
    is_priority: false,
    source_timestamp_at: "2026-09-23T09:15:00.000Z",
    source_timestamp_kind: "published",
    first_seen_at: "2026-09-23T09:20:00.000Z",
    last_seen_at: "2026-09-23T09:20:00.000Z",
    created_at: "2026-09-23T09:15:00.000Z",
    updated_at: "2026-09-23T09:15:00.000Z",
  },
  {
    id: "preview-automation-engineer",
    user_id: "preview-user",
    title: "Automation Engineer",
    description:
      "Design integrations and internal tools for a growing operations team.",
    url: "https://example.com/jobs/automation-engineer",
    source: "jooble",
    source_job_id: "preview-automation-engineer",
    company: "Example Systems",
    location: "Remote",
    is_remote: true,
    is_priority: false,
    source_timestamp_at: "2026-09-22T16:45:00.000Z",
    source_timestamp_kind: "updated",
    first_seen_at: "2026-09-22T17:00:00.000Z",
    last_seen_at: "2026-09-22T17:00:00.000Z",
    created_at: "2026-09-22T16:45:00.000Z",
    updated_at: "2026-09-22T16:45:00.000Z",
  },
]

function DashboardView({
  leads,
  isLoading,
  isRefreshing,
  error,
  realtimeWarning,
  lastSyncedAt,
  userLabel,
  headerBadgeLabel,
  isSigningOut = false,
  isPreview = false,
  onSignOut,
  onRefresh,
  onSetPriority,
}: DashboardViewProps) {
  const [sortOrder, setSortOrder] =
    useState<JobLeadSortOrder>("newest")
  const [activeView, setActiveView] = useState<"all" | "priority">("all")
  const priorityCount = leads.filter((lead) => lead.is_priority).length
  const sortedLeads = useMemo(
    () =>
      sortJobLeadsByTimestamp(
        activeView === "priority"
          ? leads.filter((lead) => lead.is_priority)
          : leads,
        sortOrder,
      ),
    [activeView, leads, sortOrder],
  )
  const leadLabel = leads.length === 1 ? "1 lead" : `${leads.length} leads`

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#f6f4ef]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_75%_0%,rgba(221,121,61,0.12),transparent_40%)]" />

      <header className="relative border-b border-black/[0.06] bg-[#f6f4ef]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#d96f32] text-white shadow-sm">
              <BriefcaseBusiness className="size-4.5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm leading-4 font-semibold tracking-tight">
                Job Lead Tracker
              </p>
              <p className="mt-1 max-w-40 truncate text-[11px] leading-3 text-muted-foreground sm:max-w-64">
                {userLabel}
              </p>
            </div>
          </div>

          {onSignOut ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onSignOut()}
              disabled={isSigningOut}
              className="text-muted-foreground"
            >
              {isSigningOut ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <LogOut />
              )}
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          ) : (
            <Badge
              variant="secondary"
              className="rounded-full bg-[#eee9e0] text-[#665b51]"
            >
              {headerBadgeLabel ?? "Preview mode"}
            </Badge>
          )}
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-5xl px-4 py-9 sm:px-6 sm:py-12">
        <section className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-[#aa5429] uppercase">
                Your pipeline
              </span>
              {!isLoading && (
                <Badge
                  variant="secondary"
                  className="rounded-full bg-[#eee9e0] text-[#665b51]"
                >
                  {leadLabel}
                </Badge>
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#302820] sm:text-4xl">
              Job leads
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#6f645b] sm:text-base">
              {isPreview
                ? "Preview the workspace while Supabase is being connected."
                : "Review opportunities collected in Supabase, sorted by their source date."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="w-fit bg-white shadow-sm"
              onClick={() =>
                setSortOrder((current) =>
                  current === "newest" ? "oldest" : "newest",
                )
              }
              disabled={isLoading}
              aria-label={`Sort by date: ${
                sortOrder === "newest"
                  ? "newest first"
                  : "oldest first"
              }`}
            >
              <ArrowDownUp />
              {sortOrder === "newest" ? "Newest first" : "Oldest first"}
            </Button>

            <Button
              variant="outline"
              className="w-fit bg-white shadow-sm"
              onClick={() => void onRefresh()}
              disabled={isPreview || isLoading || isRefreshing}
            >
              <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </section>

        <div
          className="mb-5 flex w-fit items-center rounded-xl bg-[#eae5dc] p-1"
          role="tablist"
          aria-label="Job lead views"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={activeView === "all"}
            variant="ghost"
            size="sm"
            onClick={() => setActiveView("all")}
            className={
              activeView === "all"
                ? "bg-white text-[#302820] shadow-sm hover:bg-white"
                : "text-muted-foreground"
            }
          >
            All jobs
            <span className="text-xs">{leads.length}</span>
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={activeView === "priority"}
            variant="ghost"
            size="sm"
            onClick={() => setActiveView("priority")}
            className={
              activeView === "priority"
                ? "bg-white text-[#302820] shadow-sm hover:bg-white"
                : "text-muted-foreground"
            }
          >
            <Star className={activeView === "priority" ? "fill-current" : ""} />
            Priority
            <span className="text-xs">{priorityCount}</span>
          </Button>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            {isPreview ? (
              <CloudOff
                className="size-3.5 text-amber-700"
                aria-hidden="true"
              />
            ) : (
              <Cloud
                className="size-3.5 text-[#738066]"
                aria-hidden="true"
              />
            )}
            {isPreview
              ? "Sample data — Supabase not connected"
              : "Synced with Supabase"}
          </span>
          {lastSyncedAt && (
            <>
              <Separator orientation="vertical" className="h-3" />
              <span>
                Last checked {formatPhilippineTime(lastSyncedAt)}
              </span>
            </>
          )}
        </div>

        {isPreview && (
          <Alert className="mb-5 border-amber-200 bg-amber-50/80 text-amber-950">
            <CloudOff className="text-amber-700" />
            <AlertDescription className="text-amber-900/75">
              You can explore the interface now. Prioritizing, refreshing,
              and live sync will become available after Supabase is connected.
            </AlertDescription>
          </Alert>
        )}

        {realtimeWarning && (
          <Alert className="mb-5 border-amber-200 bg-amber-50/80 text-amber-950">
            <CloudOff className="text-amber-700" />
            <AlertDescription className="text-amber-900/75">
              {realtimeWarning}
            </AlertDescription>
          </Alert>
        )}

        <JobLeadList
          leads={sortedLeads}
          isLoading={isLoading}
          error={error}
          onRetry={onRefresh}
          onSetPriority={onSetPriority}
          priorityOnly={activeView === "priority"}
          readOnly={isPreview}
        />
      </main>

      <footer className="relative mx-auto max-w-5xl px-4 py-8 text-center text-xs text-muted-foreground sm:px-6">
        {isPreview
          ? "Connect Supabase to load and sync real job leads."
          : "Leads are created externally and appear here through Realtime."}
      </footer>
    </div>
  )
}

export function LeadDashboard({ client, session }: LeadDashboardProps) {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const {
    leads,
    isLoading,
    isRefreshing,
    error,
    realtimeWarning,
    lastSyncedAt,
    refresh,
    setPriority,
  } = useJobLeads(client, session.user.id)

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      const { error: signOutError } = await client.auth.signOut()
      if (signOutError) {
        throw signOutError
      }
    } catch (signOutError) {
      toast.error(
        getErrorMessage(
          signOutError,
          "We could not sign you out. Please try again.",
        ),
      )
      setIsSigningOut(false)
    }
  }

  return (
    <DashboardView
      leads={leads}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      realtimeWarning={realtimeWarning}
      lastSyncedAt={lastSyncedAt}
      userLabel={session.user.email ?? "Signed in"}
      isSigningOut={isSigningOut}
      onSignOut={handleSignOut}
      onRefresh={refresh}
      onSetPriority={setPriority}
    />
  )
}

export function PublicLeadDashboard({
  client,
}: PublicLeadDashboardProps) {
  const {
    leads,
    isLoading,
    isRefreshing,
    error,
    realtimeWarning,
    lastSyncedAt,
    refresh,
    setPriority,
  } = useJobLeads(client)

  return (
    <DashboardView
      leads={leads}
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      error={error}
      realtimeWarning={realtimeWarning}
      lastSyncedAt={lastSyncedAt}
      userLabel="No sign-in required"
      headerBadgeLabel="Public local mode"
      onRefresh={refresh}
      onSetPriority={setPriority}
    />
  )
}

export function PreviewLeadDashboard() {
  return (
    <DashboardView
      leads={previewLeads}
      isLoading={false}
      isRefreshing={false}
      error={null}
      realtimeWarning={null}
      lastSyncedAt={null}
      userLabel="Local preview"
      isPreview
      onRefresh={() => undefined}
      onSetPriority={() => Promise.resolve()}
    />
  )
}
