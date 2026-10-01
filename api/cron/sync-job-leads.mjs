import { runJobSync } from "../../scripts/sync-job-leads.mjs"
import {
  CRON_JOB_TITLE,
  sendCronFailureEmail,
} from "../../scripts/cron-failure-email.mjs"

export function createCronHandler({
  sync = runJobSync,
  environment = process.env,
  notifyFailure = sendCronFailureEmail,
} = {}) {
  return async function GET(request) {
    const cronSecret = environment.CRON_SECRET?.trim()
    const authorization = request.headers.get("authorization")

    if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      )
    }

    try {
      const trigger =
        request.headers.get("user-agent") === "vercel-cron/1.0"
          ? "scheduled_cron"
          : "manual_cron"
      const summary = await sync({ environment, trigger })
      if (summary.dryRun) {
        throw new Error(
          `Scheduled job sync could not write to Supabase; missing ${
            summary.missingSupabaseValues?.join(", ") || "configuration"
          }`,
        )
      }
      const failedSources = summary.sourceSummaries.filter(
        (source) => source.status === "failed",
      )
      const warnings = summary.sourceSummaries.filter(
        (source) => source.status === "warning",
      )

      if (warnings.length > 0) {
        console.warn("Scheduled job sync completed with warnings", warnings)
      }

      if (failedSources.length > 0) {
        try {
          await notifyFailure({
            environment,
            cronTitle: CRON_JOB_TITLE,
            failedSources,
            requestUrl: request.url,
          })
        } catch (notificationError) {
          console.error(
            "Could not send scheduled job sync failure email",
            notificationError,
          )
        }
      }

      return Response.json(
        {
          success: failedSources.length === 0,
          fetched: summary.fetched,
          matching: summary.matching,
          unique: summary.unique,
          written: summary.written,
          syncRunId: summary.syncRunId ?? null,
          historyWarning: summary.historyWarning ?? null,
          trigger,
          existing: summary.existing ?? 0,
          linkedinTimestampBackfill: summary.linkedinTimestampBackfill ?? null,
          sources: summary.sourceSummaries,
        },
        { status: failedSources.length === 0 ? 200 : 502 },
      )
    } catch (error) {
      console.error("Scheduled job sync failed", error)

      try {
        await notifyFailure({
          environment,
          cronTitle: CRON_JOB_TITLE,
          error,
          requestUrl: request.url,
        })
      } catch (notificationError) {
        console.error(
          "Could not send scheduled job sync failure email",
          notificationError,
        )
      }

      return Response.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Scheduled job sync failed",
        },
        { status: 500 },
      )
    }
  }
}

export const GET = createCronHandler()
