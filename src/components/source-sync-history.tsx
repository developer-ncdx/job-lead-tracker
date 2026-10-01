import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import type { JobSyncRun } from "@/lib/database.types"
import { formatPhilippineDateTime } from "@/lib/philippine-time"
import {
  readSyncSources,
  syncSourceLabel,
  syncTriggerLabel,
} from "@/lib/sync-health"

const PAGE_SIZE = 20
const sourceStatuses = {
  ok: { label: "Success", className: "text-emerald-800" },
  warning: { label: "Warning", className: "text-amber-800" },
  failed: { label: "Failed", className: "text-red-700" },
  skipped: { label: "Skipped", className: "text-slate-600" },
}

export function SourceSyncHistory({
  runs,
  isLoading = false,
}: {
  runs: JobSyncRun[]
  isLoading?: boolean
}) {
  const filterId = useId()
  const [sourceFilter, setSourceFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)
  const results = [...runs]
    .sort((left, right) => Date.parse(right.started_at) - Date.parse(left.started_at))
    .flatMap((run) => readSyncSources(run.sources).map((source, index) => ({
      key: `${run.id}:${index}`,
      run,
      source,
    })))
  const sourceNames = [...new Set(results.map(({ source }) => source.name))]
    .sort((left, right) => syncSourceLabel(left).localeCompare(syncSourceLabel(right)))
  const sourceOptions = sourceFilter && !sourceNames.includes(sourceFilter)
    ? [...sourceNames, sourceFilter]
    : sourceNames
  const filtered = results.filter(({ source }) =>
    (!sourceFilter || source.name === sourceFilter) &&
    (!statusFilter || source.status === statusFilter),
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PAGE_SIZE
  const visible = filtered.slice(start, start + PAGE_SIZE)

  return (
    <section
      aria-label="Recent per-source sync results"
      className="overflow-hidden rounded-2xl border border-sky-200/70 bg-white/85 shadow-sm"
    >
      <div className="space-y-3 border-b border-sky-100 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">Recent sync runs · per-source results</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            One row per API or email source in each run, newest run first.
            Source success means fetching completed. New and existing lead counts
            cover successful writes after deduplication, based on whether each
            lead was already stored before this sync wrote it.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-xs" htmlFor={`${filterId}-source`}>
            <span className="font-medium text-slate-700">API / source</span>
            <select
              id={`${filterId}-source`}
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value)
                setPage(1)
              }}
              className="h-8 max-w-full rounded-lg border border-sky-200 bg-white px-2 sm:max-w-96"
            >
              <option value="">All sources</option>
              {sourceOptions.map((name) => (
                <option key={name} value={name}>
                  {syncSourceLabel(name)}{!sourceNames.includes(name) && " (no recent results)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs" htmlFor={`${filterId}-status`}>
            <span className="font-medium text-slate-700">Source status</span>
            <select
              id={`${filterId}-status`}
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                setPage(1)
              }}
              className="h-8 rounded-lg border border-sky-200 bg-white px-2"
            >
              <option value="">All statuses</option>
              {Object.entries(sourceStatuses).map(([status, { label }]) => (
                <option key={status} value={status}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {visible.length ? (
        <div className="overflow-x-auto">
          <table aria-label="Source sync history" className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Run started (PHT)</th>
                <th className="px-3 py-3">Trigger</th>
                <th className="px-3 py-3">API / source</th>
                <th className="px-3 py-3">Source status</th>
                <th className="px-3 py-3 text-right">Fetched</th>
                <th className="px-3 py-3 text-right">Matching</th>
                <th className="px-3 py-3 text-right">New leads added</th>
                <th className="px-5 py-3 text-right">Existing leads refreshed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map(({ key, run, source }) => (
                <tr key={key}>
                  <td className="whitespace-nowrap px-5 py-3">
                    {formatPhilippineDateTime(run.started_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {syncTriggerLabel(run.trigger)}
                  </td>
                  <td className="min-w-52 px-3 py-3">
                    <p className="break-words font-medium text-slate-700">
                      {syncSourceLabel(source.name)}
                    </p>
                    {source.error && (
                      <p className="mt-1 break-words leading-5 text-muted-foreground">
                        {source.error}
                      </p>
                    )}
                  </td>
                  <td className={`px-3 py-3 font-medium ${sourceStatuses[source.status].className}`}>
                    {sourceStatuses[source.status].label}
                  </td>
                  <td className="px-3 py-3 text-right">{source.fetched}</td>
                  <td className="px-3 py-3 text-right">{source.matching}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {source.name === "linkedin-email:timestamp-backfill"
                      ? "Not applicable"
                      : source.new_jobs ?? "Not recorded"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    {source.name === "linkedin-email:timestamp-backfill"
                      ? "Not applicable"
                      : source.existing_jobs ?? "Not recorded"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          {isLoading
            ? "Loading source sync history…"
            : results.length
              ? "No source results match these filters."
              : "No per-source results have been recorded yet. Check run summaries for runs still in progress."}
        </p>
      )}
      {filtered.length > 0 && (
        <nav
          aria-label="Source sync history pagination"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 px-5 py-3"
        >
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} source checks
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous source results page"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >Previous</Button>
            <span className="text-xs text-muted-foreground">Page {currentPage} of {pageCount}</span>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next source results page"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >Next</Button>
          </div>
        </nav>
      )}
      <p className="border-t border-sky-100 px-5 py-3 text-xs leading-5 text-muted-foreground">
        Older runs without saved per-source write counts show “Not recorded,” not zero.
        New + existing may be lower than matching because duplicates are removed.
        Date-only backfills are not lead imports.
      </p>
    </section>
  )
}
