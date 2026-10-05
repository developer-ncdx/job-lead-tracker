import { useMemo, useRef, useState } from "react"
import { ChevronRight, Globe2 } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { WebsiteJobDrawer } from "@/components/website-job-drawer"
import { sortJobLeadsByTimestamp } from "@/hooks/use-job-leads"
import type { JobLead } from "@/lib/database.types"
import { countJobsByWebsite, websiteForJob } from "@/lib/website-job-counts"

export type WebsiteJobCountsProps = {
  leads: JobLead[]
  isLoading: boolean
  error: string | null
}

export function WebsiteJobCounts({ leads, isLoading, error }: WebsiteJobCountsProps) {
  const [selectedWebsite, setSelectedWebsite] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [page, setPage] = useState(1)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const counts = useMemo(() => countJobsByWebsite(leads), [leads])
  const selectedJobs = useMemo(
    () => sortJobLeadsByTimestamp(leads.filter((lead) => websiteForJob(lead) === selectedWebsite)),
    [leads, selectedWebsite],
  )
  return (
    <Dialog open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
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
          <ul className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {counts.map(({ website, count }) => (
              <li key={website} className="min-w-0">
                <button
                  type="button"
                  aria-label={`View ${count.toLocaleString()} ${count === 1 ? "job" : "jobs"} from ${website}`}
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget
                    setSelectedWebsite(website)
                    setPage(1)
                    setIsDrawerOpen(true)
                  }}
                  className="group flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-left transition-colors hover:border-sky-200 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                >
                  <span className="min-w-0 break-all text-xs font-medium text-slate-700">{website}</span>
                  <span className="flex shrink-0 items-center gap-2 text-base font-semibold tabular-nums text-sky-700">
                    {count.toLocaleString()}
                    <ChevronRight className="size-3.5 text-slate-400 group-hover:text-sky-600" aria-hidden="true" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : !error ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">No saved jobs yet.</p>
        ) : <div className="pb-4" />}
      </section>
      {selectedWebsite && (
        <WebsiteJobDrawer
          website={selectedWebsite}
          jobs={selectedJobs}
          page={page}
          onPageChange={setPage}
          onCloseAutoFocus={(event) => {
            if (triggerRef.current?.isConnected) {
              event.preventDefault()
              triggerRef.current.focus()
            }
          }}
        />
      )}
    </Dialog>
  )
}
