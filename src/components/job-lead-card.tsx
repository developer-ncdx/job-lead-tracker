import { useState } from "react"
import {
  ArrowUpRight,
  CalendarDays,
  Link2,
  LoaderCircle,
  Star,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobLead } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
import { formatPhilippineDateTime } from "@/lib/philippine-time"

type JobLeadCardProps = {
  lead: JobLead
  onSetPriority: (leadId: string, isPriority: boolean) => Promise<void>
  readOnly?: boolean
}

function formatPostedAt(value: string) {
  return formatPhilippineDateTime(value)
}

export function JobLeadCard({
  lead,
  onSetPriority,
  readOnly = false,
}: JobLeadCardProps) {
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false)
  const postedAt = lead.source_timestamp_at
    ? formatPostedAt(lead.source_timestamp_at)
    : null
  const firstSeenAt = !postedAt && !lead.source_timestamp_label
    ? formatPostedAt(lead.first_seen_at)
    : null

  async function handlePriority() {
    setIsUpdatingPriority(true)

    try {
      await onSetPriority(lead.id, !lead.is_priority)
      toast.success(
        lead.is_priority
          ? "Removed from priority"
          : "Added to priority",
      )
    } catch (priorityError) {
      toast.error(
        getErrorMessage(
          priorityError,
          "We could not update this lead's priority.",
        ),
      )
    } finally {
      setIsUpdatingPriority(false)
    }
  }

  return (
    <Card className="group gap-0 overflow-visible border-0 bg-gradient-to-br from-white via-white to-sky-50/65 py-0 shadow-[0_12px_35px_-24px_rgba(2,132,199,0.48)] ring-1 ring-sky-200/65 transition-[box-shadow,transform,ring-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-24px_rgba(2,132,199,0.45)] hover:ring-sky-300/80">
      <article>
        <CardHeader className="grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:px-5">
          <div className="row-span-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 shadow-inner ring-1 ring-sky-200/70 transition-transform duration-200 group-hover:scale-105">
            <Link2 className="size-4.5" aria-hidden="true" />
          </div>

          <CardTitle className="min-w-0 text-[15px] leading-6 font-semibold tracking-[-0.01em] sm:text-base">
            {lead.title}
          </CardTitle>

          <Button
            asChild
            variant="link"
            size="sm"
            className="col-start-2 row-start-2 h-auto w-fit px-0 text-sky-700 hover:text-blue-700"
          >
            <a href={lead.url} target="_blank" rel="noopener noreferrer">
              Open posting
              <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>

          {postedAt && (
            <span className="col-start-2 row-start-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Posted{" "}
              <time dateTime={lead.source_timestamp_at ?? undefined}>
                {postedAt}
              </time>
            </span>
          )}

          {!postedAt && lead.source_timestamp_label && (
            <span className="col-start-2 row-start-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {/^reposted\b/i.test(lead.source_timestamp_label)
                ? lead.source_timestamp_label
                : `Posted ${lead.source_timestamp_label}`}
            </span>
          )}

          {firstSeenAt && (
            <span className="col-start-2 row-start-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              First seen{" "}
              <time dateTime={lead.first_seen_at}>{firstSeenAt}</time>
            </span>
          )}

          {!readOnly && (
            <div className="col-span-2 mt-2 flex items-center justify-end gap-1 border-t pt-3 sm:col-span-1 sm:col-start-3 sm:row-span-3 sm:row-start-1 sm:mt-0 sm:border-0 sm:pt-0">
              <Button
                variant={lead.is_priority ? "secondary" : "outline"}
                size="sm"
                onClick={() => void handlePriority()}
                disabled={isUpdatingPriority}
                aria-label={
                  lead.is_priority
                    ? `Remove ${lead.title} from priority`
                    : `Add ${lead.title} to priority`
                }
                aria-pressed={lead.is_priority}
                className={
                  lead.is_priority
                    ? "border-sky-200 bg-gradient-to-r from-sky-100 to-blue-100 text-sky-900 hover:from-sky-200 hover:to-blue-100"
                    : "border-sky-200/80 bg-white/70 text-slate-600 hover:bg-sky-50 hover:text-sky-800"
                }
              >
                {isUpdatingPriority ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Star
                    className={lead.is_priority ? "fill-current" : ""}
                  />
                )}
                {lead.is_priority ? "Priority" : "Set priority"}
              </Button>
            </div>
          )}
        </CardHeader>
      </article>
    </Card>
  )
}
