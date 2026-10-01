import type { JobSyncRun, Json, SyncTrigger } from "@/lib/database.types"

export function syncTriggerLabel(trigger: SyncTrigger) {
  return trigger === "scheduled_cron"
    ? "Scheduled cron"
    : trigger === "manual_cron"
      ? "Manual endpoint run"
      : "Local sync"
}

export function nextSyncTime(now = Date.now()) {
  return new Date((Math.floor(now / 3_600_000) + 1) * 3_600_000)
}

export function cronHealth(run: JobSyncRun | null, now = Date.now()) {
  if (!run)
    return {
      label: "Not verified",
      tone: "neutral",
      detail:
        "No scheduled cron run has been recorded. Local and manual runs do not verify the scheduler.",
    } as const
  const started = Date.parse(run.started_at)
  if (!Number.isFinite(started))
    return {
      label: "Unknown",
      tone: "neutral",
      detail: "The last cron timestamp could not be read.",
    } as const
  if (run.status === "running" && now - started > 10 * 60_000)
    return {
      label: "Incomplete",
      tone: "warning",
      detail:
        "The run has not reported completion for over 10 minutes. It may have been interrupted.",
    } as const
  if (now - started > 75 * 60_000)
    return {
      label: "Overdue",
      tone: "warning",
      detail:
        "No scheduled run has been recorded for over 75 minutes. Check the Vercel scheduler and function logs.",
    } as const
  if (run.status === "failed")
    return {
      label: "Failed",
      tone: "error",
      detail:
        "The latest scheduled run failed. Some healthy sources may still have synced.",
    } as const
  if (run.status === "running")
    return {
      label: "Running",
      tone: "neutral",
      detail: "A scheduled sync is in progress; the outcome is not yet known.",
    } as const
  if (run.status === "warning")
    return {
      label: "Warnings",
      tone: "warning",
      detail:
        "Ingestion completed with warnings. Review the source results below.",
    } as const
  return {
    label: "Healthy",
    tone: "success",
    detail:
      "The latest scheduled sync completed successfully and is within the hourly window.",
  } as const
}

export type SourceHealth = {
  name: string
  status: "ok" | "skipped" | "warning" | "failed"
  fetched: number
  matching: number
  new_jobs?: number | null
  existing_jobs?: number | null
  error: string | null
}

export function syncSourceLabel(name: string) {
  if (name === "email-alerts:gmail")
    return "Gmail alerts (includes Google Alerts)"
  if (name === "google-alerts:backfill")
    return "Google Alerts · manual backfill"
  return name
}

export function readSyncSources(value: Json): SourceHealth[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is SourceHealth =>
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      typeof item.name === "string" &&
      ["ok", "skipped", "warning", "failed"].includes(String(item.status)) &&
      typeof item.fetched === "number" &&
      typeof item.matching === "number" &&
      (item.error === null || typeof item.error === "string"),
  ).map((source) => ({
    ...source,
    new_jobs: recordedCount(source.new_jobs),
    existing_jobs: recordedCount(source.existing_jobs),
  }))
}

function recordedCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}
