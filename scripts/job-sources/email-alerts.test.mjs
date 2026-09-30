import { describe, expect, it, vi } from "vitest"

import {
  enrichEmailAlertPostedDates,
  extractExactPostedAt,
  extractProviderPostedLabel,
  fetchEmailAlertJobs,
  identifyEmailAlertProvider,
  parseJobAlertEmail,
  resolveEmailAlertEnvironment,
} from "./email-alerts.mjs"
import { matchesTargetRole } from "./role-filter.mjs"
import { isRemoteOnlyJob } from "./sync-utils.mjs"

const GOOGLE_AUTH =
  "mx.google.com; dkim=pass header.i=@google.com; " +
  "dmarc=pass (p=REJECT) header.from=google.com"

function googleRedirect(target) {
  return `https://www.google.com/url?sa=t&url=${encodeURIComponent(target)}&ct=ga`
}

function googleAlertHtml(widgets) {
  return `<script data-scope="inboxmarkup" type="application/json">${JSON.stringify({
    publisher: { name: "Google Alerts" },
    cards: [{ widgets }],
  })}</script>`
}

describe("email job alerts", () => {
  it("recognizes supported provider senders", () => {
    expect(identifyEmailAlertProvider(["jobalerts-noreply@linkedin.com"]))
      .toBe("linkedin-email")
    expect(identifyEmailAlertProvider(["alert@indeed.com"]))
      .toBe("indeed-email")
    expect(identifyEmailAlertProvider(["support@onlinejobs.ph"]))
      .toBe("onlinejobsph-email")
    expect(identifyEmailAlertProvider(["googlealerts-noreply@google.com"]))
      .toBe("google-alerts")
    expect(identifyEmailAlertProvider(["person@example.com"])).toBeNull()
  })

  it("extracts authenticated Google Alerts job results from supported sites", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: 'Google Alert - "Software Engineer" remote -hybrid',
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([
        {
          type: "LINK",
          title: "Senior Software Engineer - Fully Remote",
          description: "Work from home with Acme.",
          url: googleRedirect(
            "https://www.linkedin.com/jobs/view/senior-software-engineer-4473530223",
          ),
        },
        {
          type: "LINK",
          title: "Senior Software Engineer - Fully Remote",
          description: "The same listing in another alert card.",
          url: googleRedirect(
            "https://in.linkedin.com/jobs/view/senior-software-engineer-4473530223",
          ),
        },
        {
          type: "LINK",
          title: "Godot Game Developer - Remote",
          description: "Part-time work from home.",
          url: googleRedirect(
            "https://ph.indeed.com/viewjob?jk=cb776aedeff2a6e4&utm_source=google",
          ),
        },
        {
          type: "LINK",
          title: "AI Agent Developer - Remote",
          description: "Fully remote role.",
          url: googleRedirect(
            "https://www.onlinejobs.ph/jobseekers/job/AI-Agent-Developer-1456789",
          ),
        },
        {
          type: "LINK",
          title: "AI Engineer - Fully Remote",
          description: "Worldwide freelance role.",
          url: googleRedirect(
            "https://www.upwork.com/freelance-jobs/apply/Engineer_~022102650240074324119/",
          ),
        },
        {
          type: "LINK",
          title: "AI Engineer - Fully Remote",
          description: "The same Upwork job at its short URL.",
          url: googleRedirect(
            "https://www.upwork.com/jobs/~022102650240074324119",
          ),
        },
        {
          type: "LINK",
          title: "Manage your alerts",
          description: "Account settings",
          url: "https://www.google.com/alerts/edit",
        },
      ]),
    })

    expect(jobs).toHaveLength(4)
    expect(jobs.map(({ source, sourceJobId }) => [source, sourceJobId]))
      .toEqual([
        ["linkedin-email", "4473530223"],
        ["indeed-email", "cb776aedeff2a6e4"],
        ["onlinejobsph-email", "1456789"],
        ["upwork-email", "~022102650240074324119"],
      ])
    expect(jobs.every((job) => matchesTargetRole(job) && isRemoteOnlyJob(job)))
      .toBe(true)
    expect(jobs[0]).toMatchObject({
      url: "https://www.linkedin.com/jobs/view/4473530223",
      sourceTimestampAt: null,
      sourceTimestampKind: null,
    })
    expect(jobs[0].description).not.toContain("-hybrid")
  })

  it("does not treat the Google search query as remote evidence", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: 'Google Alert - "Software Engineer" "fully remote" -hybrid',
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([
        {
          type: "LINK",
          title: "Software Engineer",
          description: "Office-based role in Manila.",
          url: googleRedirect(
            "https://www.linkedin.com/jobs/view/software-engineer-4473530224",
          ),
        },
        {
          type: "LINK",
          title: "Software Engineer - Hybrid",
          description: "Work from home two days and onsite three days.",
          url: googleRedirect(
            "https://www.linkedin.com/jobs/view/software-engineer-4473530225",
          ),
        },
      ]),
    })

    expect(jobs).toHaveLength(2)
    expect(jobs[0].isRemote).toBe(false)
    expect(jobs.filter(isRemoteOnlyJob)).toEqual([])
  })

  it("rejects unauthenticated or spoofed Google Alerts emails", () => {
    const input = {
      subject: "Google Alert - remote jobs",
      html: googleAlertHtml([{
        type: "LINK",
        title: "Software Engineer - Remote",
        url: googleRedirect("https://www.linkedin.com/jobs/view/4473530223"),
      }]),
    }

    expect(parseJobAlertEmail({
      ...input,
      from: [{ address: "googlealerts-noreply@google.com" }],
    })).toEqual([])
    expect(parseJobAlertEmail({
      ...input,
      from: [{ address: "googlealerts-noreply@lookalike.com" }],
      authenticationResults: GOOGLE_AUTH,
    })).toEqual([])
  })

  it("falls back to visible Google result links when inbox markup is absent", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Google Alert - remote developer",
      authenticationResults: GOOGLE_AUTH,
      html: `<a href="${googleRedirect(
        "https://www.linkedin.com/jobs/view/4473530223",
      ).replace(/&/g, "&amp;")}">Software Engineer - Fully Remote</a>
        <div>Work from home at Acme.</div>
        <a href="https://www.google.com/alerts/edit">Edit alert</a>`,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      source: "linkedin-email",
      sourceJobId: "4473530223",
      isRemote: true,
    })
  })

  it("does not borrow remote wording from adjacent fallback links", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Google Alert - remote software engineer",
      authenticationResults: GOOGLE_AUTH,
      html: `<a href="${googleRedirect(
        "https://www.linkedin.com/jobs/view/4473530223",
      ).replace(/&/g, "&amp;")}">Software Engineer</a>
        <div>Other fully remote jobs you might like</div>`,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].isRemote).toBe(false)
  })

  it("reads authenticated Google Alerts from Spam without changing mailbox state", async () => {
    let mailbox = ""
    const releases = []
    const client = {
      usable: true,
      connect: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([
        { path: "INBOX", specialUse: "\\Inbox" },
        { path: "[Gmail]/Spam", specialUse: "\\Junk" },
      ]),
      getMailboxLock: vi.fn(async (path) => {
        mailbox = path
        const release = vi.fn()
        releases.push(release)
        return { release }
      }),
      search: vi.fn(async () => mailbox === "INBOX" ? [] : [42]),
      fetch: vi.fn(async function* () {
        yield {
          uid: 42,
          envelope: {
            from: [{ address: "googlealerts-noreply@google.com" }],
          },
          source: Buffer.from([
            "From: Google Alerts <googlealerts-noreply@google.com>",
            "Subject: Google Alert - remote jobs",
            `Authentication-Results: ${GOOGLE_AUTH}`,
            "MIME-Version: 1.0",
            "Content-Type: text/html; charset=utf-8",
            "",
            `<a href="${googleRedirect(
              "https://www.linkedin.com/jobs/view/4473530223",
            ).replace(/&/g, "&amp;")}">Software Engineer - Fully Remote</a>`,
          ].join("\r\n")),
        }
      }),
      logout: vi.fn().mockResolvedValue(undefined),
    }

    const jobs = await fetchEmailAlertJobs({}, {
      environment: {
        JOB_ALERT_EMAIL_USER: "person@example.com",
        JOB_ALERT_EMAIL_APP_PASSWORD: "abcdefghijklmnop",
        JOB_ALERT_ENRICH_POSTED_DATES: "false",
      },
      clientFactory: () => client,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].sourceJobId).toBe("4473530223")
    expect(client.getMailboxLock).toHaveBeenCalledWith(
      "[Gmail]/Spam",
      { readOnly: true },
    )
    expect(client.search).toHaveBeenCalledWith(
      expect.objectContaining({ from: "googlealerts-noreply@google.com" }),
      { uid: true },
    )
    expect(releases).toHaveLength(2)
    expect(releases.every((release) => release.mock.calls.length === 1))
      .toBe(true)
    expect(client.logout).toHaveBeenCalledOnce()
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
        includeLinkedIn: true,
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
      {
        includeLinkedIn: true,
        fetchImpl: async () => new Response("", { status: 429 }),
      },
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
        includeLinkedIn: true,
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

  it("leaves LinkedIn pages for the bounded backfill while enriching other providers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        '<script type="application/ld+json">' +
          '{"@type":"JobPosting","datePosted":"2026-09-27T09:01:19.000Z"}' +
          "</script>",
      ),
    )
    const jobs = await enrichEmailAlertPostedDates(
      [
        {
          source: "linkedin-email",
          sourceJobId: "4261234567",
          url: "https://www.linkedin.com/jobs/view/4261234567",
          sourceTimestampAt: null,
        },
        {
          source: "indeed-email",
          sourceJobId: "indeed-1",
          url: "https://www.indeed.com/viewjob?jk=indeed-1",
          sourceTimestampAt: null,
        },
      ],
      { fetchImpl },
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.indeed.com/viewjob?jk=indeed-1",
      expect.any(Object),
    )
    expect(jobs[0].sourceTimestampAt).toBeNull()
    expect(jobs[1].sourceTimestampAt).toBe("2026-09-27T09:01:19.000Z")
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
