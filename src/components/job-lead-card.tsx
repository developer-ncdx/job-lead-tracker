import { ArrowUpRight, CalendarDays, Link2 } from "lucide-react"

import { DeleteLeadDialog } from "@/components/delete-lead-dialog"
import { EditLeadDialog } from "@/components/edit-lead-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobLead, JobLeadUpdate } from "@/lib/database.types"

type JobLeadCardProps = {
  lead: JobLead
  onUpdate: (leadId: string, values: JobLeadUpdate) => Promise<void>
  onDelete: (leadId: string) => Promise<void>
  readOnly?: boolean
}

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

function formatPostedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : dateTimeFormatter.format(date)
}

export function JobLeadCard({
  lead,
  onUpdate,
  onDelete,
  readOnly = false,
}: JobLeadCardProps) {
  const postedAt = lead.source_timestamp_at
    ? formatPostedAt(lead.source_timestamp_at)
    : null

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
              <EditLeadDialog lead={lead} onUpdate={onUpdate} />
              <DeleteLeadDialog lead={lead} onDelete={onDelete} />
            </div>
          )}
        </CardHeader>
      </article>
    </Card>
  )
}
