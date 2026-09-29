import { useMemo, useRef, useState } from "react"
import type { Session, SupabaseClient } from "@supabase/supabase-js"
import {
  ArrowDownUp,
  BriefcaseBusiness,
  CloudOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
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
import { Input } from "@/components/ui/input"
import type { Database, JobLead } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const listStartRef = useRef<HTMLDivElement>(null)
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
  const pageCount = Math.max(1, Math.ceil(sortedLeads.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const firstVisibleLead = (currentPage - 1) * pageSize
  const paginatedLeads = sortedLeads.slice(
    firstVisibleLead,
    firstVisibleLead + pageSize,
  )

  function changePage(nextPage: number) {
    setPage(nextPage)
    requestAnimationFrame(() =>
      listStartRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    )
  }

  function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize)
    changePage(1)
  }

  function submitPageInput(value: string) {
    const requestedPage = Number.parseInt(value, 10)
    changePage(
      Number.isFinite(requestedPage)
        ? Math.min(pageCount, Math.max(1, requestedPage))
        : currentPage,
    )
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-gradient-to-b from-sky-50 via-[#f7fcff] to-blue-50/70">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(56,189,248,0.20),transparent_28%),radial-gradient(circle_at_88%_12%,rgba(99,102,241,0.13),transparent_25%),linear-gradient(135deg,rgba(255,255,255,0.5),transparent_45%)]" />
      <div className="pointer-events-none absolute top-44 -left-32 size-80 rounded-full bg-cyan-200/20 blur-3xl" />

      <header className="relative border-b border-sky-200/60 bg-white/65 shadow-[0_1px_20px_rgba(14,165,233,0.05)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_8px_20px_-8px_rgba(14,165,233,0.8)] ring-1 ring-white/60">
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
              className="rounded-full border border-sky-200/70 bg-white/75 text-sky-800 shadow-sm"
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
              <span className="text-xs font-semibold tracking-[0.16em] text-sky-700 uppercase">
                Your pipeline
              </span>
              {!isLoading && (
                <Badge
                  variant="secondary"
                  className="rounded-full border border-sky-200 bg-sky-100/80 text-sky-800"
                >
                  {leadLabel}
                </Badge>
              )}
            </div>
            <h1 className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 bg-clip-text text-3xl font-semibold tracking-[-0.04em] text-transparent sm:text-4xl">
              Job leads
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="w-fit border-sky-200/80 bg-white/85 text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
              onClick={() => {
                setPage(1)
                setSortOrder((current) =>
                  current === "newest" ? "oldest" : "newest",
                )
              }}
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
              className="w-fit border-sky-200/80 bg-white/85 text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50"
              onClick={() => void onRefresh()}
              disabled={isPreview || isLoading || isRefreshing}
            >
              <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </Button>
          </div>
        </section>

        <div
          className="mb-5 flex w-fit items-center rounded-xl border border-sky-200/60 bg-white/60 p-1 shadow-sm backdrop-blur"
          role="tablist"
          aria-label="Job lead views"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={activeView === "all"}
            variant="ghost"
            size="sm"
            onClick={() => {
              setActiveView("all")
              setPage(1)
            }}
            className={
              activeView === "all"
                ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:from-sky-500 hover:to-blue-600"
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
            onClick={() => {
              setActiveView("priority")
              setPage(1)
            }}
            className={
              activeView === "priority"
                ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:from-sky-500 hover:to-blue-600"
                : "text-muted-foreground"
            }
          >
            <Star className={activeView === "priority" ? "fill-current" : ""} />
            Priority
            <span className="text-xs">{priorityCount}</span>
          </Button>
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

        <div ref={listStartRef} className="scroll-mt-5">
          <JobLeadList
            leads={paginatedLeads}
            isLoading={isLoading}
            error={error}
            onRetry={onRefresh}
            onSetPriority={onSetPriority}
            priorityOnly={activeView === "priority"}
            readOnly={isPreview}
          />
        </div>

        {!isLoading && sortedLeads.length > pageSize && (
          <nav
            className="mt-6 flex flex-col gap-3 rounded-xl border border-sky-200/70 bg-white/75 px-4 py-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between"
            aria-label="Job lead pagination"
          >
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Jobs per page</span>
              <label className="relative flex h-7 min-w-12 cursor-pointer items-center justify-center gap-1 rounded-md border border-sky-200 bg-white px-2 font-medium text-slate-700 shadow-xs hover:bg-sky-50">
                <span>{pageSize}</span>
                <ChevronDown className="size-3.5" aria-hidden="true" />
                <select
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={pageSize}
                  onChange={(event) =>
                    changePageSize(Number(event.target.value))
                  }
                  aria-label="Jobs per page"
                >
                  <option value={10}>10 jobs per page</option>
                  <option value={20}>20 jobs per page</option>
                  <option value={50}>50 jobs per page</option>
                </select>
              </label>
            </div>

            <div className="flex items-center justify-end gap-1">
              <span className="mr-2 text-xs font-medium text-slate-600">
                {firstVisibleLead + 1}–{Math.min(
                  firstVisibleLead + pageSize,
                  sortedLeads.length,
                )} of {sortedLeads.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => changePage(1)}
                disabled={currentPage === 1}
                aria-label="First page"
              >
                <ChevronsLeft />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => changePage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>

              <Input
                key={currentPage}
                type="number"
                min={1}
                max={pageCount}
                defaultValue={currentPage}
                onBlur={(event) => submitPageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur()
                  }
                }}
                aria-label="Current page"
                className="mx-1 h-7 w-10 rounded-md border-sky-200 bg-white px-1 text-center text-xs [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="mr-1 text-xs text-slate-500">
                of {pageCount}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  changePage(Math.min(pageCount, currentPage + 1))
                }
                disabled={currentPage === pageCount}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => changePage(pageCount)}
                disabled={currentPage === pageCount}
                aria-label="Last page"
              >
                <ChevronsRight />
              </Button>
            </div>
          </nav>
        )}
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
      userLabel="Local preview"
      isPreview
      onRefresh={() => undefined}
      onSetPriority={() => Promise.resolve()}
    />
  )
}
