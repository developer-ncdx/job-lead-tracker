import type { JobSyncRun } from "@/lib/database.types"

export function makeSyncRun(values: Partial<JobSyncRun> = {}): JobSyncRun {
  return {
    id: "run-1",
    user_id: null,
    trigger: "scheduled_cron",
    status: "success",
    started_at: "2026-10-01T01:00:00Z",
    finished_at: "2026-10-01T01:02:00Z",
    fetched: 100,
    matching: 30,
    unique_jobs: 20,
    written: 20,
    existing_jobs: 15,
    sources: [],
    error_message: null,
    ...values,
  }
}
