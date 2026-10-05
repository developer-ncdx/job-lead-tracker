import { useMemo } from "react"
import { Globe2 } from "lucide-react"
import type { JobLead } from "@/lib/database.types"
import { countJobsByWebsite } from "@/lib/website-job-counts"

export type WebsiteJobCountsProps = {
  leads: JobLead[]
  isLoading: boolean
  error: string | null
}

export function WebsiteJobCounts({ leads, isLoading, error }: WebsiteJobCountsProps) {
  const counts = useMemo(() => countJobsByWebsite(leads), [leads])
  return (
    <section aria-label="Jobs by website" className="overflow-hidden rounded-2xl border border-sky-200/70 bg-white/85 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 px-5 py-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Globe2 className="size-4 text-sky-600" /> Jobs by website
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            All saved jobs, including applied and not interested.
          </p>
        </div>
        {!isLoading && (!error || leads.length > 0) && (
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">
            {leads.length.toLocaleString()} total
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="px-5 pt-4 text-xs text-amber-800">
          Job counts could not be refreshed. {leads.length > 0 ? "Totals may be out of date." : "Use Refresh status to try again."}
        </p>
      )}
      {isLoading ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">Loading job counts…</p>
      ) : counts.length > 0 ? (
        <dl className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {counts.map(({ website, count }) => (
            <div key={website} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
              <dt className="min-w-0 break-all text-xs font-medium text-slate-700">{website}</dt>
              <dd className="shrink-0 text-base font-semibold tabular-nums text-sky-700">{count.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      ) : !error ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">No saved jobs yet.</p>
      ) : <div className="pb-4" />}
    </section>
  )
}
