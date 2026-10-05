import { useRef } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog"
import type { JobLead } from "@/lib/database.types"
import { estimateRelativeDate, formatPhilippineDate } from "@/lib/philippine-time"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 20

type WebsiteJobDrawerProps = {
  website: string
  jobs: JobLead[]
  page: number
  onPageChange: (page: number) => void
  onCloseAutoFocus: (event: Event) => void
}

export function WebsiteJobDrawer({ website, jobs, page, onPageChange, onCloseAutoFocus }: WebsiteJobDrawerProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const pageCount = Math.max(1, Math.ceil(jobs.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const start = (currentPage - 1) * PAGE_SIZE
  const visibleJobs = jobs.slice(start, start + PAGE_SIZE)

  function changePage(nextPage: number) {
    onPageChange(nextPage)
    if (listRef.current) listRef.current.scrollTop = 0
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        onCloseAutoFocus={onCloseAutoFocus}
        className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col border-l border-sky-100 bg-slate-50 shadow-2xl outline-none duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right motion-reduce:animate-none sm:max-w-xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-sky-100 bg-white px-5 py-5">
          <div className="min-w-0">
            <DialogTitle className="break-words text-lg font-semibold leading-6 text-slate-900">
              {website} jobs
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              {jobs.length.toLocaleString()} saved {jobs.length === 1 ? "job" : "jobs"} · Newest first
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Close job drawer">
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </header>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved jobs from this website.</p>
          ) : (
            <ul aria-label={`Jobs from ${website}`} className="space-y-3">
              {visibleJobs.map((job) => {
                const estimatedPostedAt = !job.source_timestamp_at && job.source_timestamp_label
                  ? estimateRelativeDate(job.source_timestamp_label, job.last_seen_at)
                  : null
                return (
                  <li key={job.id} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                    <span className={cn(
                      "mb-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                      job.applied_at ? "bg-emerald-50 text-emerald-800"
                        : job.not_interested_at ? "bg-slate-100 text-slate-600"
                          : "bg-sky-50 text-sky-800",
                    )}>
                      {job.applied_at ? "Applied" : job.not_interested_at ? "Not interested" : "Job lead"}
                    </span>
                    <h3 className="text-sm font-semibold leading-6 text-slate-800">
                      <a href={job.url} target="_blank" rel="noopener noreferrer" className="rounded-sm hover:text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
                        {job.title}
                        <ArrowUpRight className="ml-1 inline size-3.5 text-sky-600" aria-hidden="true" />
                      </a>
                    </h3>
                    {(job.company || job.location) && (
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {[job.company, job.location].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {job.source_timestamp_at ? (
                        <>Posted <time dateTime={job.source_timestamp_at}>{formatPhilippineDate(job.source_timestamp_at)}</time></>
                      ) : estimatedPostedAt ? (
                        <>Approx. <time dateTime={estimatedPostedAt.toISOString()}>{formatPhilippineDate(estimatedPostedAt)}</time></>
                      ) : job.source_timestamp_label || (
                        <>First seen <time dateTime={job.first_seen_at}>{formatPhilippineDate(job.first_seen_at)}</time></>
                      )}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sky-100 bg-white px-5 py-4">
          <p role="status" className="text-xs text-muted-foreground">
            {jobs.length > 0
              ? `${(start + 1).toLocaleString()}–${Math.min(start + PAGE_SIZE, jobs.length).toLocaleString()} of ${jobs.length.toLocaleString()}`
              : "0 jobs"}
          </p>
          {pageCount > 1 && (
            <nav aria-label="Website jobs pagination" className="flex gap-2">
              <Button variant="outline" size="sm" aria-label="Previous jobs" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <Button variant="outline" size="sm" aria-label="Next jobs" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </nav>
          )}
        </footer>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
