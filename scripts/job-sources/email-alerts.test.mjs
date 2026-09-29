import { describe, expect, it } from "vitest"

import {
  enrichEmailAlertPostedDates,
  extractExactPostedAt,
  extractProviderPostedLabel,
  identifyEmailAlertProvider,
  parseJobAlertEmail,
  resolveEmailAlertEnvironment,
} from "./email-alerts.mjs"

describe("email job alerts", () => {
  it("recognizes supported provider senders", () => {
    expect(identifyEmailAlertProvider(["jobalerts-noreply@linkedin.com"]))
      .toBe("linkedin-email")
    expect(identifyEmailAlertProvider(["alert@indeed.com"]))
      .toBe("indeed-email")
    expect(identifyEmailAlertProvider(["support@onlinejobs.ph"]))
      .toBe("onlinejobsph-email")
    expect(identifyEmailAlertProvider(["person@example.com"])).toBeNull()
  })

  it("extracts and canonicalizes LinkedIn job links", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "jobalerts-noreply@linkedin.com" }],
      subject: "New remote software engineer jobs",
      html: `
        <table><tr><td>
          <a href="https://www.linkedin.com/comm/jobs/view/4261234567?trackingId=abc">
            Senior Software Engineer
          </a>
          <p>Acme · Philippines (Remote)</p>
        </td></tr></table>
      `,
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        source: "linkedin-email",
        sourceJobId: "4261234567",
        title: "Senior Software Engineer",
        url: "https://www.linkedin.com/jobs/view/4261234567",
        isRemote: true,
      }),
    ])
  })

  it("extracts Indeed links and ignores non-job links", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "alert@indeed.com" }],
      subject: "software engineer jobs in Remote",
      html: `
        <a href="https://www.indeed.com/viewjob?jk=abc123&utm_source=jobseeker_emails">
          AI Automation &amp; Shopify Developer
        </a>
        <p>ByLashBabe · Remote, Philippines</p>
        <a href="https://www.indeed.com/account/view">Manage settings</a>
      `,
      text: `
        AI Automation & Shopify Developer
        ByLashBabe - Work from Home
        2 days ago
        https://www.indeed.com/viewjob?jk=abc123
      `,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      source: "indeed-email",
      sourceJobId: "abc123",
      title: "AI Automation & Shopify Developer",
      url: "https://www.indeed.com/viewjob?jk=abc123",
      isRemote: true,
      sourceTimestampAt: null,
      sourceTimestampKind: null,
    })
  })

  it("accepts only an exact absolute JobPosting date", () => {
    expect(
      extractExactPostedAt(`
        <script type="application/ld+json">
          {"@type":"JobPosting","datePosted":"2026-09-27T09:01:19.000Z"}
        </script>
      `),
    ).toBe("2026-09-27T09:01:19.000Z")
    expect(
      extractExactPostedAt(`
        <script type="application/ld+json">
          {"@type":"JobPosting","datePosted":"2026-09-27"}
        </script>
      `),
    ).toBeNull()
    expect(extractExactPostedAt("<p>Reposted 2 days ago</p>")).toBeNull()
  })

  it("keeps LinkedIn relative posting text without inventing a timestamp", () => {
    expect(
      extractProviderPostedLabel(
        '<span class="posted-time-ago__text">Reposted 2 days ago</span>',
      ),
    ).toBe("Reposted 2 days ago")
  })

  it("enriches LinkedIn jobs from public-page posted metadata", async () => {
    const jobs = await enrichEmailAlertPostedDates(
      [
        {
          source: "linkedin-email",
          sourceJobId: "4261234567",
          url: "https://www.linkedin.com/jobs/view/4261234567",
          sourceTimestampAt: null,
          sourceTimestampKind: null,
        },
      ],
      {
        fetchImpl: async () =>
          new Response(
            '<script type="application/ld+json">' +
              '{"@type":"JobPosting","datePosted":"2026-09-27T09:01:19.000Z"}' +
              "</script>",
          ),
      },
    )

    expect(jobs[0]).toMatchObject({
      sourceTimestampAt: "2026-09-27T09:01:19.000Z",
      sourceTimestampKind: "published",
      sourceTimestampLabel: null,
    })
  })

  it("does not invent a LinkedIn posted date when metadata is unavailable", async () => {
    const jobs = await enrichEmailAlertPostedDates(
      [
        {
          source: "linkedin-email",
          sourceJobId: "4261234567",
          url: "https://www.linkedin.com/jobs/view/4261234567",
          sourceTimestampAt: null,
          sourceTimestampKind: null,
        },
      ],
      { fetchImpl: async () => new Response("", { status: 429 }) },
    )

    expect(jobs[0]).toMatchObject({
      sourceTimestampAt: null,
      sourceTimestampKind: null,
      sourceTimestampLabel: null,
    })
  })

  it("preserves LinkedIn relative wording without converting it", async () => {
    const jobs = await enrichEmailAlertPostedDates(
      [
        {
          source: "linkedin-email",
          sourceJobId: "4427682709",
          url: "https://www.linkedin.com/jobs/view/4427682709",
          sourceTimestampAt: null,
          sourceTimestampKind: null,
        },
      ],
      {
        fetchImpl: async () =>
          new Response(
            '<span class="posted-time-ago__text">Reposted 2 days ago</span>',
          ),
      },
    )

    expect(jobs[0]).toMatchObject({
      sourceTimestampAt: null,
      sourceTimestampKind: null,
      sourceTimestampLabel: "Reposted 2 days ago",
    })
  })

  it("extracts OnlineJobs.ph listings", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "jobs@onlinejobs.ph" }],
      subject: "New work from home jobs",
      html: `
        <a href="https://www.onlinejobs.ph/jobseekers/job/AI-Agent-Developer-1456789?ref=email">
          AI Agent Developer
        </a>
        <div>Work from home · Full time</div>
      `,
    })

    expect(jobs).toEqual([
      expect.objectContaining({
        source: "onlinejobsph-email",
        sourceJobId: "1456789",
        title: "AI Agent Developer",
        url: "https://www.onlinejobs.ph/jobseekers/job/AI-Agent-Developer-1456789",
        isRemote: true,
      }),
    ])
  })

  it("supports the existing environment variable names", () => {
    expect(
      resolveEmailAlertEnvironment({
        JOB_ALERT_EMAIL_ENABLED: "true",
        JOB_ALERT_EMAIL_USER: "person@example.com",
        JOB_ALERT_EMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
      }),
    ).toMatchObject({
      enabled: true,
      host: "imap.gmail.com",
      port: 993,
      user: "person@example.com",
      password: "abcdefghijklmnop",
      missing: [],
    })
  })
})
