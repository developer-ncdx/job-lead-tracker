import { useState } from "react"
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Eye,
  Mail,
  Link2,
  LoaderCircle,
  ThumbsDown,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobLead } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import {
  estimateRelativeDate,
  formatPhilippineDate,
  formatPhilippineDateTime,
} from "@/lib/philippine-time"

type JobLeadCardProps = {
  lead: JobLead
  onSetNotInterested: (leadId: string, isNotInterested: boolean) => Promise<void>
  onSetRead: (leadId: string, isRead: boolean) => Promise<void>
  onSetApplied: (leadId: string, isApplied: boolean) => Promise<void>
  readOnly?: boolean
}

function formatPostedAt(value: string) {
  return formatPhilippineDateTime(value)
}

function formatRelativePostedAt(value: string) {
  return value.replace(/^(?:re)?posted\s+/i, "").trim()
}

export function JobLeadCard({
  lead,
  onSetNotInterested,
  onSetRead,
  onSetApplied,
  readOnly = false,
}: JobLeadCardProps) {
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false)
  const isRead = Boolean(lead.is_read)
  const isApplied = Boolean(lead.applied_at)
  const isNotInterested = Boolean(lead.not_interested_at)
  const postedAt = lead.source_timestamp_at
    ? formatPostedAt(lead.source_timestamp_at)
    : null
  const estimatedPostedAt =
    !postedAt && lead.source_timestamp_label
      ? estimateRelativeDate(
          lead.source_timestamp_label,
          lead.last_seen_at,
        )
      : null
  const estimatedPostedDate = estimatedPostedAt
    ? formatPhilippineDate(estimatedPostedAt)
    : null
  const firstSeenAt =
    !postedAt && !lead.source_timestamp_label
      ? formatPhilippineDateTime(lead.first_seen_at)
      : null

  async function handleNotInterested() {
    setIsUpdatingTracking(true)
    try {
      await onSetNotInterested(lead.id, !isNotInterested)
      toast.success(isNotInterested ? "Returned to job leads" : "Moved to not interested")
    } catch (error) {
      toast.error(getErrorMessage(error, "We could not save this job's interest status."))
    } finally {
      setIsUpdatingTracking(false)
    }
  }

  async function handleRead(isRead: boolean) {
    if (readOnly || isUpdatingTracking) return
    setIsUpdatingTracking(true)
    try {
      await onSetRead(lead.id, isRead)
    } catch (error) {
      toast.error(
        getErrorMessage(error, "We could not save this job's read status."),
      )
    } finally {
      setIsUpdatingTracking(false)
    }
  }

  async function handleApplied() {
    setIsUpdatingTracking(true)
    try {
      await onSetApplied(lead.id, !isApplied)
      toast.success(
        isApplied ? "Removed from applied jobs" : "Added to applied jobs",
      )
    } catch (error) {
      toast.error(
        getErrorMessage(error, "We could not save this job's application status."),
      )
    } finally {
      setIsUpdatingTracking(false)
    }
  }

  return (
    <Card className={cn(
      "group gap-0 overflow-visible border-0 py-0 ring-1 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5",
      isRead
        ? "bg-slate-100/90 shadow-sm ring-slate-200 hover:ring-slate-300"
        : "bg-gradient-to-br from-white via-white to-sky-50/65 shadow-[0_12px_35px_-24px_rgba(2,132,199,0.48)] ring-sky-200/65 hover:shadow-[0_20px_42px_-24px_rgba(2,132,199,0.45)] hover:ring-sky-300/80",
    )}>
      <article
        aria-label={lead.title}
        data-read-state={isRead ? "read" : "unread"}
      >
        <CardHeader className="grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-4 sm:px-5">
          <div className={cn(
            "flex size-10 items-center justify-center rounded-xl shadow-inner ring-1 transition-transform duration-200 group-hover:scale-105",
            isApplied ? "row-span-4" : "row-span-3",
            isRead
              ? "bg-slate-200/80 text-slate-600 ring-slate-300/70"
              : "bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 ring-sky-200/70",
          )}>
            <Link2 className="size-4.5" aria-hidden="true" />
          </div>

          <CardTitle className={cn(
            "min-w-0 text-[15px] leading-6 tracking-[-0.01em] sm:text-base",
            isRead ? "font-medium text-slate-600" : "font-semibold",
          )}>
            <span>{lead.title}</span>
            <span className={cn(
              "ml-2 inline-flex rounded-full px-2 py-0.5 align-middle text-[10px] leading-4 font-medium",
              isRead ? "bg-slate-200 text-slate-600" : "bg-sky-100 text-sky-800",
            )}>
              {isRead ? "Read" : "Unread"}
            </span>
          </CardTitle>

          <Button
            asChild
            variant="link"
            size="sm"
            className={cn(
              "col-start-2 row-start-2 h-auto w-fit px-0",
              isRead ? "text-slate-600 hover:text-slate-900" : "text-sky-700 hover:text-blue-700",
            )}
          >
            <a
              href={lead.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (!isRead) void handleRead(true)
              }}
              onAuxClick={(event) => {
                if (event.button === 1 && !isRead) void handleRead(true)
              }}
            >
              Open posting
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>

          {postedAt && (
            <span className="col-start-2 row-start-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              <time dateTime={lead.source_timestamp_at ?? undefined}>
                {lead.source === "linkedin-email"
                  ? postedAt
                  : `Posted ${postedAt}`}
              </time>
            </span>
          )}

          {!postedAt && lead.source_timestamp_label && (
            <span className="col-start-2 row-start-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {estimatedPostedDate ? (
                <time dateTime={estimatedPostedAt?.toISOString()}>
                  Approx. {estimatedPostedDate}
                </time>
              ) : (
                formatRelativePostedAt(lead.source_timestamp_label)
              )}
            </span>
          )}

          {firstSeenAt && (
            <span className="col-start-2 row-start-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              <time dateTime={lead.first_seen_at}>
                First seen {firstSeenAt}
              </time>
            </span>
          )}

          {lead.applied_at && (
            <span className="col-start-2 flex items-center gap-1.5 text-xs text-slate-600">
              <Check className="size-3.5" aria-hidden="true" />
              <time dateTime={lead.applied_at}>
                Applied {formatPhilippineDateTime(lead.applied_at)}
              </time>
            </span>
          )}

          {!readOnly && (
            <div className="col-span-2 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/70 pt-3">
              <Button
                variant="ghost"
                size="sm"
                disabled={isUpdatingTracking}
                onClick={() => void handleRead(!isRead)}
                aria-label={`Mark ${lead.title} as ${isRead ? "unread" : "read"}`}
                className="text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
              >
                {isRead ? <Mail /> : <Eye />}
                Mark {isRead ? "unread" : "read"}
              </Button>
              <Button
                variant={isNotInterested ? "secondary" : "outline"}
                size="sm"
                onClick={() => void handleNotInterested()}
                disabled={isUpdatingTracking}
                aria-label={isNotInterested ? `Restore ${lead.title} from not interested` : `Mark ${lead.title} as not interested`}
                aria-pressed={isNotInterested}
                className="border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <ThumbsDown />
                {isNotInterested ? "Not interested · Undo" : "Not interested"}
              </Button>
              <Button
                variant={isApplied ? "secondary" : "outline"}
                size="sm"
                onClick={() => void handleApplied()}
                disabled={isUpdatingTracking}
                aria-label={isApplied
                  ? `Remove ${lead.title} from applied jobs`
                  : `Mark ${lead.title} as applied`}
                aria-pressed={isApplied}
                className={isApplied
                  ? "border-slate-300 bg-slate-200 text-slate-700 hover:bg-slate-300"
                  : "border-sky-200 bg-white/70 text-sky-800 hover:bg-sky-50"}
              >
                {isUpdatingTracking
                  ? <LoaderCircle className="animate-spin" />
                  : <Check />}
                {isApplied ? "Applied · Undo" : "Mark applied"}
              </Button>
            </div>
          )}
        </CardHeader>
      </article>
    </Card>
  )
}
