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
    <Card className="gap-0 overflow-visible border-0 bg-white py-0 shadow-[0_8px_30px_-24px_rgba(62,45,31,0.55)] ring-1 ring-black/[0.07] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-26px_rgba(62,45,31,0.5)]">
      <article>
        <CardHeader className="grid-cols-[auto_1fr] gap-x-3 gap-y-2 px-4 py-4 sm:grid-cols-[auto_1fr_auto] sm:px-5">
          <div className="row-span-3 flex size-10 items-center justify-center rounded-xl bg-[#f5e8dc] text-[#b85d2c]">
            <Link2 className="size-4.5" aria-hidden="true" />
          </div>

          <CardTitle className="min-w-0 text-[15px] leading-6 font-semibold tracking-[-0.01em] sm:text-base">
            {lead.title}
          </CardTitle>

          <Button
            asChild
            variant="link"
            size="sm"
            className="col-start-2 row-start-2 h-auto w-fit px-0 text-[#a94f25]"
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
                    ? "bg-amber-100 text-amber-900 hover:bg-amber-200"
                    : "text-muted-foreground"
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
