import nodemailer from "nodemailer"

export const CRON_JOB_TITLE = "Hourly job lead sync"

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function parsePort(value) {
  const port = Number.parseInt(value ?? "465", 10)

  return Number.isInteger(port) && port > 0 ? port : 465
}

function isSecure(value, port) {
  if (value === undefined || value === "") {
    return port === 465
  }

  return value.toLowerCase() === "true"
}

export function buildCronFailureMessage({
  cronTitle = CRON_JOB_TITLE,
  failedSources = [],
  error,
  occurredAt = new Date(),
  requestUrl,
}) {
  const lines = [
    `Cron job: ${cronTitle}`,
    "Status: Failed",
    `Time: ${occurredAt.toISOString()}`,
  ]

  if (requestUrl) {
    lines.push(`Endpoint: ${requestUrl}`)
  }

  if (error !== undefined) {
    lines.push("", `Failure message: ${errorMessage(error)}`)
  }

  if (failedSources.length > 0) {
    lines.push("", "Failed sources:")

    for (const source of failedSources) {
      lines.push(`- ${source.name}: ${source.error || "Unknown error"}`)
    }
  }

  lines.push("", "Check the Vercel function logs for the complete run details.")

  return lines.join("\n")
}

export async function sendCronFailureEmail({
  environment = process.env,
  cronTitle = CRON_JOB_TITLE,
  failedSources = [],
  error,
  occurredAt,
  requestUrl,
  transportFactory = nodemailer.createTransport,
} = {}) {
  const user = environment.JOB_ALERT_EMAIL_USER?.trim()
  const password = environment.JOB_ALERT_EMAIL_APP_PASSWORD?.replace(/\s+/g, "")
  const recipient =
    environment.JOB_SYNC_FAILURE_EMAIL_TO?.trim() || user

  const missing = [
    !user && "JOB_ALERT_EMAIL_USER",
    !password && "JOB_ALERT_EMAIL_APP_PASSWORD",
    !recipient && "JOB_SYNC_FAILURE_EMAIL_TO",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `Cannot send cron failure email; missing ${missing.join(", ")}`,
    )
  }

  const port = parsePort(environment.JOB_SYNC_SMTP_PORT)
  const transporter = transportFactory({
    host: environment.JOB_SYNC_SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: isSecure(environment.JOB_SYNC_SMTP_SECURE, port),
    auth: { user, pass: password },
  })

  return transporter.sendMail({
    from: `Job Lead Tracker <${user}>`,
    to: recipient,
    subject: `[Cron failed] ${cronTitle}`,
    text: buildCronFailureMessage({
      cronTitle,
      failedSources,
      error,
      occurredAt,
      requestUrl,
    }),
  })
}
