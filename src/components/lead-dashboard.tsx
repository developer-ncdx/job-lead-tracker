import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import type { Session, SupabaseClient } from "@supabase/supabase-js"
import {
  ArrowDownUp,
  Activity,
  BriefcaseBusiness,
  CloudOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ThumbsDown,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { JobLeadList } from "@/components/job-lead-list"
import { ConnectedSyncPanel, SyncPanel } from "@/components/sync-panel"
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
  onSetNotInterested: (leadId: string, isNotInterested: boolean) => Promise<void>
  onSetRead: (leadId: string, isRead: boolean) => Promise<void>
  onSetApplied: (leadId: string, isApplied: boolean) => Promise<void>
  syncPanel?: ReactNode
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
    is_read: false,
    applied_at: null,
    not_interested_at: null,
    source_timestamp_at: "2026-09-23T12:30:00.000Z",
    source_timestamp_kind: "published",
    source_timestamp_label: null,
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
    is_read: true,
    applied_at: "2026-09-24T02:00:00.000Z",
    not_interested_at: null,
    source_timestamp_at: "2026-09-23T09:15:00.000Z",
    source_timestamp_kind: "published",
    source_timestamp_label: null,
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
    is_read: false,
    applied_at: null,
    not_interested_at: null,
    source_timestamp_at: "2026-09-22T16:45:00.000Z",
    source_timestamp_kind: "updated",
    source_timestamp_label: null,
    first_seen_at: "2026-09-22T17:00:00.000Z",
    last_seen_at: "2026-09-22T17:00:00.000Z",
    created_at: "2026-09-22T16:45:00.000Z",
    updated_at: "2026-09-22T16:45:00.000Z",
  },
]

type MainPage = "jobs" | "applied" | "not-interested" | "sync"

function pageFromHash(): MainPage {
  if (window.location.hash === "#sync-cron") return "sync"
  if (window.location.hash === "#applied-jobs") return "applied"
  if (window.location.hash === "#not-interested") return "not-interested"
  return "jobs"
}

export function DashboardView({
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
  onSetNotInterested,
  onSetRead,
  onSetApplied,
  syncPanel,
}: DashboardViewProps) {
  const [sortOrder, setSortOrder] = useState<JobLeadSortOrder>("newest")
  const [mainPage, setMainPage] = useState<MainPage>(pageFromHash)
  const [readFilter, setReadFilter] = useState<"all" | "read" | "unread">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const listStartRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const notInterestedCount = leads.filter((lead) => lead.not_interested_at).length
  const availableCount = leads.filter((lead) => !lead.applied_at && !lead.not_interested_at).length
  const appliedCount = leads.filter((lead) => lead.applied_at).length
  const isJobPage = mainPage !== "sync"
  const sortedLeads = useMemo(
    () => {
      const viewLeads = mainPage === "applied"
        ? leads.filter((lead) => lead.applied_at)
        : mainPage === "not-interested"
          ? leads.filter((lead) => lead.not_interested_at)
          : leads.filter((lead) => !lead.applied_at && !lead.not_interested_at)
      return sortJobLeadsByTimestamp(
        viewLeads.filter((lead) => {
          if (readFilter !== "all" && Boolean(lead.is_read) !== (readFilter === "read")) return false
          const sourceLabel = lead.source?.startsWith("onlinejobsph")
            ? "OnlineJobs.ph"
            : lead.source?.replace(/-email$/, "").replaceAll("-", " ")
          return [lead.title, lead.company, sourceLabel].some((value) =>
            value?.toLowerCase().includes(normalizedQuery),
          )
        }),
        sortOrder,
      )
    },
    [mainPage, readFilter, normalizedQuery, leads, sortOrder],
  )
  const viewCount = mainPage === "applied" ? appliedCount : mainPage === "not-interested" ? notInterestedCount : availableCount
  const leadLabel = viewCount === 1 ? "1 lead" : `${viewCount} leads`
  const pageCount = Math.max(1, Math.ceil(sortedLeads.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const firstVisibleLead = (currentPage - 1) * pageSize
  const paginatedLeads = sortedLeads.slice(
    firstVisibleLead,
    firstVisibleLead + pageSize,
  )

  useEffect(() => {
    const updatePage = () => {
      setMainPage(pageFromHash())
      setPage(1)
      setReadFilter("all")
    }
    window.addEventListener("hashchange", updatePage)
    window.addEventListener("popstate", updatePage)
    return () => {
      window.removeEventListener("hashchange", updatePage)
      window.removeEventListener("popstate", updatePage)
    }
  }, [])

  function navigate(
    event: MouseEvent<HTMLAnchorElement>,
    nextPage: MainPage,
  ) {
    // Keep native modified-click behavior, including opening a page in a new tab.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    event.preventDefault()
    const hash = nextPage === "sync" ? "#sync-cron" : nextPage === "applied" ? "#applied-jobs" : nextPage === "not-interested" ? "#not-interested" : "#job-leads"
    if (window.location.hash !== hash) window.history.pushState(null, "", hash)
    setMainPage(nextPage)
    setPage(1)
    setReadFilter("all")
  }

  function changePage(nextPage: number) {
    setPage(nextPage)
    requestAnimationFrame(() =>
      listStartRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    )
  }

  function clearSearch() {
    setSearchQuery("")
    setPage(1)
    searchInputRef.current?.focus()
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
        <nav
          aria-label="Main navigation"
          className="border-t border-sky-100/80"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-3 overflow-x-auto px-4 sm:gap-7 sm:px-6 [&>a]:shrink-0">
            <a
              href="#job-leads"
              onClick={(event) => navigate(event, "jobs")}
              aria-current={mainPage === "jobs" ? "page" : undefined}
              className={`flex min-h-12 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${mainPage === "jobs" ? "border-sky-500 text-sky-800" : "border-transparent text-slate-500 hover:border-sky-200 hover:text-sky-700"}`}
            >
              <BriefcaseBusiness className="size-4" aria-hidden="true" /> Job
              leads
            </a>
            <a
              href="#applied-jobs"
              onClick={(event) => navigate(event, "applied")}
              aria-current={mainPage === "applied" ? "page" : undefined}
              className={`flex min-h-12 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${mainPage === "applied" ? "border-sky-500 text-sky-800" : "border-transparent text-slate-500 hover:border-sky-200 hover:text-sky-700"}`}
            >
              <ClipboardCheck className="size-4" aria-hidden="true" /> Applied jobs
              <span aria-label={`${appliedCount} applied jobs`} className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{appliedCount}</span>
            </a>
            <a
              href="#not-interested"
              onClick={(event) => navigate(event, "not-interested")}
              aria-current={mainPage === "not-interested" ? "page" : undefined}
              className={`flex min-h-12 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${mainPage === "not-interested" ? "border-sky-500 text-sky-800" : "border-transparent text-slate-500 hover:border-sky-200 hover:text-sky-700"}`}
            >
              <ThumbsDown className="size-4" aria-hidden="true" /> Not interested
              <span aria-label={`${notInterestedCount} not interested jobs`} className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{notInterestedCount}</span>
            </a>
            <a
              href="#sync-cron"
              onClick={(event) => navigate(event, "sync")}
              aria-current={mainPage === "sync" ? "page" : undefined}
              className={`flex min-h-12 items-center gap-2 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${mainPage === "sync" ? "border-sky-500 text-sky-800" : "border-transparent text-slate-500 hover:border-sky-200 hover:text-sky-700"}`}
            >
              <Activity className="size-4" aria-hidden="true" /> Sync & cron
            </a>
          </div>
        </nav>
      </header>

      <main className="relative mx-auto w-full max-w-5xl px-4 py-9 sm:px-6 sm:py-12">
        <section className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold tracking-[0.16em] text-sky-700 uppercase">
                {mainPage === "sync" ? "Operations" : mainPage === "applied" ? "Your applications" : mainPage === "not-interested" ? "Dismissed jobs" : "Your pipeline"}
              </span>
              {isJobPage && !isLoading && (
                <Badge
                  variant="secondary"
                  className="rounded-full border border-sky-200 bg-sky-100/80 text-sky-800"
                >
                  {leadLabel}
                </Badge>
              )}
            </div>
            <h1 className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 bg-clip-text text-3xl font-semibold tracking-[-0.04em] text-transparent sm:text-4xl">
              {mainPage === "sync" ? "Sync & cron" : mainPage === "applied" ? "Applied jobs" : mainPage === "not-interested" ? "Not interested" : "Job leads"}
            </h1>
          </div>

          {isJobPage && (
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
                aria-label={`Sort by posting date: ${
                  sortOrder === "newest" ? "newest first" : "oldest first"
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
          )}
        </section>

        {isJobPage && (
          <div className="mb-4 w-full max-w-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                ref={searchInputRef}
                type="search"
                aria-label="Search jobs"
                placeholder="Search titles, companies, or sources…"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setPage(1)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") clearSearch()
                }}
                className="h-11 border-sky-200/80 bg-white/85 pr-12 pl-10 text-slate-700 shadow-sm [&::-webkit-search-cancel-button]:appearance-none"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Clear job search"
                  onClick={clearSearch}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 text-slate-500 hover:bg-sky-50"
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
            <p aria-live="polite" aria-atomic="true" className="mt-2 text-xs text-slate-600">
              {normalizedQuery && !isLoading ? `${sortedLeads.length} ${sortedLeads.length === 1 ? "job" : "jobs"} found` : ""}
            </p>
          </div>
        )}

        {isJobPage && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              {mainPage === "applied" ? "Jobs you marked as applied. Use Undo to remove a saved application." : mainPage === "not-interested" ? "Jobs you dismissed. Use Undo to return a job to your leads." : "Unread jobs are highlighted. Read jobs are shown in gray."}
            </p>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              Read status
              <select
                aria-label="Filter by read status"
                value={readFilter}
                onChange={(event) => {
                  setReadFilter(event.target.value as "all" | "read" | "unread")
                  setPage(1)
                }}
                className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
              >
                <option value="all">All read states</option>
                <option value="unread">Unread</option>
                <option value="read">Read</option>
              </select>
            </label>
          </div>
        )}

        {isPreview && (
          <Alert className="mb-5 border-amber-200 bg-amber-50/80 text-amber-950">
            <CloudOff className="text-amber-700" />
            <AlertDescription className="text-amber-900/75">
              You can explore the interface now. Saving job status, refreshing, and
              live sync will become available after Supabase is connected.
            </AlertDescription>
          </Alert>
        )}

        {realtimeWarning && isJobPage && (
          <Alert className="mb-5 border-amber-200 bg-amber-50/80 text-amber-950">
            <CloudOff className="text-amber-700" />
            <AlertDescription className="text-amber-900/75">
              {realtimeWarning}
            </AlertDescription>
          </Alert>
        )}

        {mainPage === "sync" ? (
          <div id="sync-panel">
            {syncPanel ?? (
              <SyncPanel
                runs={[]}
                latestCron={null}
                lastSuccess={null}
                onRefresh={() => undefined}
                isPreview={isPreview}
              />
            )}
          </div>
        ) : (
          <div
            ref={listStartRef}
            id={`${mainPage}-panel`}
            role="region"
            aria-label={mainPage === "applied" ? "Applied jobs list" : mainPage === "not-interested" ? "Not interested jobs list" : "Job leads list"}
            className="scroll-mt-5"
          >
            <JobLeadList
              leads={paginatedLeads}
              isLoading={isLoading}
              error={error}
              onRetry={onRefresh}
              onSetNotInterested={onSetNotInterested}
              onSetRead={onSetRead}
              onSetApplied={onSetApplied}
              notInterestedOnly={mainPage === "not-interested"}
              appliedOnly={mainPage === "applied"}
              readFilter={readFilter}
              hasSearchQuery={Boolean(normalizedQuery)}
              onClearSearch={clearSearch}
              readOnly={isPreview}
            />
          </div>
        )}

        {isJobPage && !isLoading && sortedLeads.length > pageSize && (
          <nav
            className="mt-7 flex justify-center overflow-x-auto px-1 py-1"
            aria-label="Job lead pagination"
          >
            <div className="flex flex-none items-center gap-1 rounded-xl border border-sky-200/80 bg-white/85 p-1.5 shadow-[0_8px_24px_-16px_rgba(14,165,233,0.75)] backdrop-blur">
              <label className="relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-sky-50">
                <span>
                  {firstVisibleLead + 1}–
                  {Math.min(firstVisibleLead + pageSize, sortedLeads.length)} of{" "}
                  {sortedLeads.length}
                </span>
                <ChevronDown className="size-3.5" aria-hidden="true" />
                <select
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={pageSize}
                  onChange={(event) =>
                    changePageSize(Number(event.target.value))
                  }
                  aria-label="Jobs per page"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <span className="mx-1 h-5 w-px bg-sky-100" aria-hidden="true" />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-700"
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
                className="rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-700"
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
                className="mx-1 h-8 w-10 rounded-lg border-sky-200 bg-sky-50/50 px-1 text-center text-xs shadow-none focus-visible:border-sky-400 focus-visible:ring-sky-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="mr-1 text-xs text-slate-500">
                of {pageCount}
              </span>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-700"
                onClick={() => changePage(Math.min(pageCount, currentPage + 1))}
                disabled={currentPage === pageCount}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-lg text-slate-500 hover:bg-sky-50 hover:text-sky-700"
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
    setNotInterested,
    setRead,
    setApplied,
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
      onSetNotInterested={setNotInterested}
      onSetRead={setRead}
      onSetApplied={setApplied}
      syncPanel={
        <ConnectedSyncPanel
          key={session.user.id}
          client={client}
          ownerId={session.user.id}
        />
      }
    />
  )
}

export function PublicLeadDashboard({ client }: PublicLeadDashboardProps) {
  const {
    leads,
    isLoading,
    isRefreshing,
    error,
    realtimeWarning,
    refresh,
    setNotInterested,
    setRead,
    setApplied,
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
      onSetNotInterested={setNotInterested}
      onSetRead={setRead}
      onSetApplied={setApplied}
      syncPanel={<ConnectedSyncPanel client={client} />}
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
      onSetNotInterested={() => Promise.resolve()}
      onSetRead={() => Promise.resolve()}
      onSetApplied={() => Promise.resolve()}
    />
  )
}
