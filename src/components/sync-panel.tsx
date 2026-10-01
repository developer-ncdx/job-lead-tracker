import { useEffect, useState } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Activity, AlertTriangle, Clock3, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SourceSyncHistory } from "@/components/source-sync-history"
import { useSyncHistory } from "@/hooks/use-sync-history"
import type { Database, JobSyncRun } from "@/lib/database.types"
import { formatPhilippineDateTime } from "@/lib/philippine-time"
import {
  cronHealth,
  nextSyncTime,
  readSyncSources,
  syncSourceLabel,
  syncTriggerLabel,
} from "@/lib/sync-health"

export type SyncPanelProps = {
  runs: JobSyncRun[]
  latestCron: JobSyncRun | null
  lastSuccess: JobSyncRun | null
  isLoading?: boolean
  isRefreshing?: boolean
  error?: string | null
  checkedAt?: string | null
  onRefresh: () => void | Promise<void>
  isPreview?: boolean
}

const toneClasses = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
}

export function SyncPanel({
  runs,
  latestCron,
  lastSuccess,
  isLoading = false,
  isRefreshing = false,
  error = null,
  checkedAt = null,
  onRefresh,
  isPreview = false,
}: SyncPanelProps) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const health = error
    ? {
        label: "Unavailable",
        tone: "neutral" as const,
        detail: "Current cron health could not be verified.",
      }
    : cronHealth(latestCron, now)
  const latest = runs[0]
  // A local run may be newer than the cron, but cannot hide the cron's failures.
  const inspectedRun = latestCron ?? latest
  const sources = readSyncSources(inspectedRun?.sources ?? [])

  return (
    <section aria-label="Sync and cron health" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <Activity className="size-5 text-sky-600" /> Sync & cron health
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Status refreshes every minute while this tab is open. Times are in
            PHT.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void onRefresh()}
          disabled={isPreview || isLoading || isRefreshing}
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
          {isRefreshing ? "Checking status" : "Refresh status"}
        </Button>
      </div>
      {error && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-950">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {isPreview && (
        <Alert className="border-sky-200 bg-sky-50">
          <AlertDescription>
            Preview only. Connect Supabase and enable run history to see actual
            cron results.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-sky-200/70 bg-white/85 p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Scheduled cron health
          </p>
          <span
            className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${toneClasses[health.tone]}`}
          >
            {isLoading ? "Checking…" : health.label}
          </span>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {isLoading ? "Reading recorded cron outcomes." : health.detail}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            Last cron:{" "}
            {latestCron
              ? formatPhilippineDateTime(latestCron.started_at)
              : "No tracked run"}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200/70 bg-white/85 p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Last successful sync · any trigger
          </p>
          <p className="mt-3 text-base font-semibold text-slate-800">
            {isLoading
              ? "Loading…"
              : lastSuccess
                ? formatPhilippineDateTime(
                    lastSuccess.finished_at ?? lastSuccess.started_at,
                  )
                : "No tracked success"}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {lastSuccess
              ? `${syncTriggerLabel(lastSuccess.trigger)} · ${lastSuccess.status === "warning" ? "completed with warnings" : "completed successfully"}`
              : "First-seen job timestamps are not proof of a successful sync."}
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200/70 bg-white/85 p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Clock3 className="size-3.5" /> Next expected cron run
          </p>
          <p className="mt-3 text-base font-semibold text-slate-800">
            {formatPhilippineDateTime(nextSyncTime(now))}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Configured hourly schedule. This is an expected time, not
            confirmation that Vercel will execute it.
          </p>
        </div>
        <div className="rounded-2xl border border-sky-200/70 bg-white/85 p-5 shadow-sm">
          <p className="text-xs font-medium text-muted-foreground">
            Last sync attempt · any trigger
          </p>
          <p className="mt-3 text-base font-semibold text-slate-800">
            {isLoading
              ? "Loading…"
              : latest
                ? formatPhilippineDateTime(latest.started_at)
                : "No tracked attempt"}
          </p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {latest
              ? `${syncTriggerLabel(latest.trigger)} · ${latest.status} · ${latest.written} rows synced (${latest.unique_jobs} unique matches)`
              : "Run history starts after tracking is enabled."}
          </p>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-sky-200/70 bg-white/85 shadow-sm">
        <h3 className="border-b border-sky-100 px-5 py-4 text-sm font-semibold">
          {latestCron
            ? "Latest scheduled run · source results"
            : "Latest recorded run · source results"}
        </h3>
        {inspectedRun?.error_message && (
          <p
            role="alert"
            className="m-4 rounded-lg bg-red-50 p-3 text-xs text-red-700"
          >
            {inspectedRun.error_message}
          </p>
        )}
        {sources.length ? (
          <ul className="divide-y divide-slate-100">
            {sources.map((source, index) => (
              <li key={`${source.name}:${index}`} className="px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700">
                    {syncSourceLabel(source.name)}
                  </span>
                  <span
                    className={
                      source.status === "failed"
                        ? "text-red-700"
                        : source.status === "warning"
                          ? "text-amber-800"
                          : "text-slate-600"
                    }
                  >
                    {source.status} · {source.fetched} fetched ·{" "}
                    {source.matching} matching
                  </span>
                </div>
                {source.error && (
                  <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                    {source.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            {isLoading
              ? "Loading source results…"
              : "No source results have been recorded yet."}
          </p>
        )}
      </div>
      <SourceSyncHistory runs={runs} isLoading={isLoading} />
      <div className="overflow-hidden rounded-2xl border border-sky-200/70 bg-white/85 shadow-sm">
        <h3 className="border-b border-sky-100 px-5 py-4 text-sm font-semibold">
          Run summaries
        </h3>
        {runs.length ? (
          <div className="overflow-x-auto">
            <table aria-label="Run summaries" className="w-full text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Started (PHT)</th>
                  <th className="px-3 py-3">Trigger</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Rows synced</th>
                  <th className="px-3 py-3 text-right">New leads added</th>
                  <th className="px-5 py-3 text-right">Existing leads refreshed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-5 py-3">
                      {formatPhilippineDateTime(run.started_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {syncTriggerLabel(run.trigger)}
                    </td>
                    <td className="px-3 py-3">{run.status}</td>
                    <td className="px-5 py-3 text-right">{run.written}</td>
                    <td className="px-3 py-3 text-right">
                      {Math.max(0, run.written - run.existing_jobs)}
                    </td>
                    <td className="px-5 py-3 text-right">{run.existing_jobs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            {isLoading
              ? "Loading sync history…"
              : "No tracked runs yet. Earlier cron outcomes cannot be reconstructed from job import dates."}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Rows synced includes new jobs and refreshed existing jobs, not only new additions.
        Gmail source counts include Google Alerts and supported job-board emails;
        historical runs do not have separate Google Alert counts.
      </p>
      <p className="text-xs text-muted-foreground">
        {checkedAt
          ? `Last status check: ${formatPhilippineDateTime(checkedAt)}. `
          : ""}
        Refresh status only reads history; it does not start a job sync.
      </p>
    </section>
  )
}

export function ConnectedSyncPanel({
  client,
  ownerId = null,
}: {
  client: SupabaseClient<Database>
  ownerId?: string | null
}) {
  const history = useSyncHistory(client, ownerId)
  return <SyncPanel {...history} onRefresh={history.refresh} />
}
