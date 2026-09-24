import { CircleAlert, Inbox, RefreshCw } from "lucide-react"

import { JobLeadCard } from "@/components/job-lead-card"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { JobLead, JobLeadUpdate } from "@/lib/database.types"

type JobLeadListProps = {
  leads: JobLead[]
  isLoading: boolean
  error: string | null
  onRetry: () => void | Promise<void>
  onUpdate: (leadId: string, values: JobLeadUpdate) => Promise<void>
  onDelete: (leadId: string) => Promise<void>
  readOnly?: boolean
}

function LeadSkeleton() {
  return (
    <Card className="gap-0 border-0 bg-white py-0 ring-1 ring-black/[0.06]">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </Card>
  )
}

export function JobLeadList({
  leads,
  isLoading,
  error,
  onRetry,
  onUpdate,
  onDelete,
  readOnly = false,
}: JobLeadListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4" aria-label="Loading job leads">
        <LeadSkeleton />
        <LeadSkeleton />
        <LeadSkeleton />
      </div>
    )
  }

  if (error && leads.length === 0) {
    return (
      <Alert className="border-red-200 bg-white py-4" variant="destructive">
        <CircleAlert />
        <AlertTitle>Could not load job leads</AlertTitle>
        <AlertDescription className="pr-22">{error}</AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={() => void onRetry()}>
            <RefreshCw />
            Retry
          </Button>
        </AlertAction>
      </Alert>
    )
  }

  if (leads.length === 0) {
    return (
      <Card className="border-dashed bg-white/65 py-0 shadow-none ring-0">
        <CardContent className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-[#f1e8dc] text-[#a95a31]">
            <Inbox className="size-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">No job leads yet</h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Leads created by your external source will appear here
            automatically once they are assigned to your Supabase user.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5 bg-white"
            onClick={() => void onRetry()}
          >
            <RefreshCw />
            Check again
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
          <CircleAlert className="text-amber-700" />
          <AlertTitle>Showing the last loaded results</AlertTitle>
          <AlertDescription className="text-amber-900/75">
            {error}
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => void onRetry()}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
      )}

      <div className="grid gap-4">
        {leads.map((lead) => (
          <JobLeadCard
            key={lead.id}
            lead={lead}
            onUpdate={onUpdate}
            onDelete={onDelete}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}
