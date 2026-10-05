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
import type { JobLead } from "@/lib/database.types"

type JobLeadListProps = {
  leads: JobLead[]
  isLoading: boolean
  error: string | null
  onRetry: () => void | Promise<void>
  onSetNotInterested: (leadId: string, isNotInterested: boolean) => Promise<void>
  onSetRead: (leadId: string, isRead: boolean) => Promise<void>
  onSetApplied: (leadId: string, isApplied: boolean) => Promise<void>
  notInterestedOnly?: boolean
  appliedOnly?: boolean
  readFilter?: "all" | "read" | "unread"
  hasSearchQuery?: boolean
  onClearSearch?: () => void
  readOnly?: boolean
}

function LeadSkeleton() {
  return (
    <Card className="gap-0 border-0 bg-white/80 py-0 ring-1 ring-sky-200/70">
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
  onSetNotInterested,
  onSetRead,
  onSetApplied,
  notInterestedOnly = false,
  appliedOnly = false,
  readFilter = "all",
  hasSearchQuery = false,
  onClearSearch,
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
      <Card className="border-dashed border-sky-300 bg-gradient-to-br from-white/80 to-sky-100/60 py-0 shadow-none ring-0">
        <CardContent className="flex flex-col items-center px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-200 text-sky-700 shadow-inner">
            <Inbox className="size-5" aria-hidden="true" />
          </div>
          <h2 className="text-base font-semibold">
            {hasSearchQuery ? "No matching jobs" : readFilter !== "all" ? `No ${readFilter} jobs` : appliedOnly ? "No applied jobs yet" : notInterestedOnly ? "No jobs marked not interested" : "No job leads yet"}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {hasSearchQuery
              ? "Try a different search or change the read filter."
              : readFilter !== "all"
              ? "No jobs in this view have that read status. Change the read filter to see more jobs."
              : appliedOnly
                ? "Use Mark applied on a job to keep track of your applications here."
                : notInterestedOnly
                  ? "Use Not interested on a job to move it here. You can restore it with Undo."
              : "Leads created by your external source will appear here automatically once they are assigned to your Supabase user."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5 border-sky-200 bg-white text-sky-800 hover:bg-sky-50"
            onClick={() => hasSearchQuery && onClearSearch ? onClearSearch() : void onRetry()}
          >
            {!hasSearchQuery && <RefreshCw />}
            {hasSearchQuery ? "Clear search" : "Check again"}
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
            onSetNotInterested={onSetNotInterested}
            onSetRead={onSetRead}
            onSetApplied={onSetApplied}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  )
}
