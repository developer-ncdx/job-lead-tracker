import { describe, expect, it, vi } from "vitest"

import {
  buildCronFailureMessage,
  sendCronFailureEmail,
} from "./cron-failure-email.mjs"

describe("cron failure email", () => {
  it("includes the cron title and source errors", () => {
    const message = buildCronFailureMessage({
      cronTitle: "Hourly job lead sync",
      occurredAt: new Date("2026-09-29T16:00:00.000Z"),
      requestUrl: "https://example.com/api/cron/sync-job-leads",
      failedSources: [
        { name: "email-alerts:gmail", error: "IMAP login failed" },
      ],
    })

    expect(message).toContain("Cron job: Hourly job lead sync")
    expect(message).toContain("Time: 2026-09-29T16:00:00.000Z")
    expect(message).toContain(
      "- email-alerts:gmail: IMAP login failed",
    )
  })

  it("sends through Gmail SMTP to the configured recipient", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message-1" })
    const transportFactory = vi.fn().mockReturnValue({ sendMail })

    await sendCronFailureEmail({
      environment: {
        JOB_ALERT_EMAIL_USER: "sender@gmail.com",
        JOB_ALERT_EMAIL_APP_PASSWORD: "app- pass word",
        JOB_SYNC_FAILURE_EMAIL_TO: "noxpwr@gmail.com",
      },
      error: new Error("sync crashed"),
      transportFactory,
    })

    expect(transportFactory).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "sender@gmail.com",
        pass: "app-password",
      },
    })
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Job Lead Tracker <sender@gmail.com>",
        to: "noxpwr@gmail.com",
        subject: "[Cron failed] Hourly job lead sync",
        text: expect.stringContaining("Failure message: sync crashed"),
      }),
    )
  })

  it("requires SMTP credentials", async () => {
    await expect(
      sendCronFailureEmail({
        environment: {
          JOB_SYNC_FAILURE_EMAIL_TO: "noxpwr@gmail.com",
        },
      }),
    ).rejects.toThrow(
      "missing JOB_ALERT_EMAIL_USER, JOB_ALERT_EMAIL_APP_PASSWORD",
    )
  })
})
