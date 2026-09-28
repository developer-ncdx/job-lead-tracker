import { runJobSync } from "../../scripts/sync-job-leads.mjs"

export function createCronHandler({
  sync = runJobSync,
  environment = process.env,
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
      const summary = await sync({ environment })
      const failedSources = summary.sourceSummaries.filter(
        (source) => source.status === "failed",
      )

      return Response.json(
        {
          success: failedSources.length === 0,
          fetched: summary.fetched,
          matching: summary.matching,
          unique: summary.unique,
          written: summary.written,
          existing: summary.existing ?? 0,
          sources: summary.sourceSummaries,
        },
        { status: failedSources.length === 0 ? 200 : 502 },
      )
    } catch (error) {
      console.error("Scheduled job sync failed", error)

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
