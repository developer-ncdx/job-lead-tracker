import { describe, expect, it, vi } from "vitest"

import {
  enrichEmailAlertPostedDates,
  extractExactPostedAt,
  extractProviderPostedLabel,
  identifyEmailAlertProvider,
  parseJobAlertEmail,
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
    expect(identifyEmailAlertProvider(["donotreply@upwork.com"]))
      .toBe("upwork-email")
    expect(identifyEmailAlertProvider(["jobs@notify.upwork.com"]))
      .toBe("upwork-email")
    expect(identifyEmailAlertProvider(["jobs@fakeupwork.com"])).toBeNull()
    expect(identifyEmailAlertProvider(["jobs@upwork.com.example.com"])).toBeNull()
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
      }]) + `<a href="${googleRedirect("https://www.indeed.com/viewjob?jk=remote123")}">AI Developer - Remote</a>`,
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
    expect(parseJobAlertEmail({
      ...input,
      from: [{ address: "googlealerts-noreply@google.com" }],
      authenticationResults: "mx.google.com; dmarc=fail header.from=google.com",
    })).toEqual([])
    expect(parseJobAlertEmail({
      ...input,
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Not a Google Alert",
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

  it("reads all 17 visible results when inbox metadata includes only four", () => {
    const results = Array.from({ length: 17 }, (_, index) => ({
      type: "LINK",
      title: `Software Engineer ${index + 1} - Fully Remote`,
      description: `Work from home at Company ${index + 1}.`,
      url: googleRedirect(
        `https://www.linkedin.com/jobs/view/${4473530200 + index}`,
      ),
    }))
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Google Alert - remote software engineer -hybrid",
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml(results.slice(0, 4)) + results.map((result) =>
        `<a href="${result.url.replace(/&/g, "&amp;")}">${result.title}</a>`,
      ).join("\n"),
    })

    expect(jobs).toHaveLength(17)
    expect(new Set(jobs.map((job) => job.sourceJobId)).size).toBe(17)
    expect(jobs.every((job) => matchesTargetRole(job) && isRemoteOnlyJob(job)))
      .toBe(true)
    expect(jobs[0].description).toBe(results[0].description)
    expect(jobs[4].description).toBe("")
  })

  it("keeps structured hybrid evidence while merging additional visible jobs", () => {
    const hybridUrl = googleRedirect("https://www.linkedin.com/jobs/view/4473530223")
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Google Alert - remote jobs -hybrid -onsite",
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([{
        type: "LINK",
        title: "Software Engineer - Remote",
        description: "Hybrid role: onsite three days, work from home two days.",
        url: hybridUrl,
      }]) + `
        <a href="${hybridUrl}">Software Engineer - Fully Remote</a>
        <a href="${googleRedirect("https://www.indeed.com/viewjob?jk=remote123")}">AI Developer - Fully Remote</a>
        <a href="${googleRedirect("https://www.onlinejobs.ph/jobseekers/job/Software-Engineer-12345")}">Software Engineer</a>
        <div>Other fully remote jobs you might like</div>
        <a href="https://www.google.com/alerts/edit">Edit alert</a>
        <a href="https://example.com/jobs/1">Software Engineer - Remote</a>
        <a href="https://www.linkedin.com/jobs/view/4473530229">Apply now</a>`,
    })

    expect(jobs).toHaveLength(3)
    expect(jobs[0].description).toContain("Hybrid role")
    expect(jobs[2].isRemote).toBe(true)
    expect(jobs.filter(isRemoteOnlyJob).map((job) => job.sourceJobId))
      .toEqual(["remote123", "12345"])
  })

  it("keeps OnlineJobs.ph developer jobs without remote wording in either email format", () => {
    const url = "https://www.onlinejobs.ph/jobseekers/job/Automation-Developer-1456789"
    const direct = parseJobAlertEmail({
      from: ["support@onlinejobs.ph"],
      subject: "New jobs for you",
      html: `<a href="${url}">Automation Developer</a><p>Build API integrations.</p>`,
    })
    const google = parseJobAlertEmail({
      from: ["googlealerts-noreply@google.com"],
      subject: "Google Alert - automation developer",
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([{
        type: "LINK",
        title: "Automation Developer",
        description: "Build API integrations.",
        url: googleRedirect(url),
      }]),
    })

    for (const jobs of [direct, google]) {
      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toMatchObject({
        source: "onlinejobsph-email",
        isRemote: true,
        location: "Remote",
      })
      expect(matchesTargetRole(jobs[0]) && isRemoteOnlyJob(jobs[0])).toBe(true)
    }
  })

  it("still rejects explicit onsite or hybrid OnlineJobs.ph listings", () => {
    const jobs = parseJobAlertEmail({
      from: ["googlealerts-noreply@google.com"],
      subject: "Google Alert - software engineer",
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([
        {
          type: "LINK",
          title: "Software Engineer",
          description: "Onsite role in Manila.",
          url: googleRedirect("https://www.onlinejobs.ph/jobseekers/job/Software-Engineer-12345"),
        },
        {
          type: "LINK",
          title: "Automation Developer",
          description: "Hybrid: remote two days, office-based three days.",
          url: googleRedirect("https://www.onlinejobs.ph/jobseekers/job/Automation-Developer-12346"),
        },
      ]),
    })

    expect(jobs).toHaveLength(2)
    expect(jobs.filter(isRemoteOnlyJob)).toEqual([])
  })

  it("extracts direct Upwork job alerts while ignoring account and promotional links", () => {
    const jobs = parseJobAlertEmail({
      from: ["donotreply@upwork.com"],
      subject: "New remote software developer jobs",
      html: `<a href="https://www.upwork.com/jobs/~022102650240074324119?utm_source=email">Software Developer</a>
        <p>Fully remote freelance project.</p>
        <a href="https://www.upwork.com/freelance-jobs/apply/Software-Developer_~022102650240074324119/">Apply now</a>
        <a href="https://www.upwork.com/nx/find-work/">Find work</a>
        <a href="https://www.upwork.com/plus">Freelancer Plus</a>`,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      source: "upwork-email",
      sourceJobId: "~022102650240074324119",
      title: "Software Developer",
      isRemote: true,
    })
    expect(matchesTargetRole(jobs[0]) && isRemoteOnlyJob(jobs[0])).toBe(true)
    expect(parseJobAlertEmail({
      from: ["donotreply@upwork.com"],
      subject: "Your profile is approved",
      html: '<a href="https://www.upwork.com/nx/find-work/">Find work</a>',
    })).toEqual([])
  })

  it("merges multiple metadata blocks and visible links despite malformed metadata", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Google Alert - remote jobs",
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([{
        type: "LINK",
        title: "Software Engineer - Remote",
        url: googleRedirect("https://www.linkedin.com/jobs/view/4473530223"),
      }]) + `<script data-scope="inboxmarkup" type="application/json">{broken}</script>` +
        googleAlertHtml([{
          type: "LINK",
          title: "AI Engineer - Fully Remote",
          url: googleRedirect("https://www.upwork.com/jobs/~022102650240074324119"),
        }]) + `<a href="${googleRedirect("https://www.indeed.com/viewjob?jk=remote123")}">AI Developer - Remote</a>`,
    })

    expect(jobs.map((job) => job.source))
      .toEqual(["linkedin-email", "upwork-email", "indeed-email"])
  })

  it("does not treat HTML inside metadata descriptions as visible result links", () => {
    const jobs = parseJobAlertEmail({
      from: [{ address: "googlealerts-noreply@google.com" }],
      subject: "Google Alert - remote jobs",
      authenticationResults: GOOGLE_AUTH,
      html: googleAlertHtml([{
        type: "LINK",
        title: "Software Engineer - Remote",
        description: "<a href='https://www.linkedin.com/jobs/view/4473530224'>AI Engineer - Remote</a>",
        url: googleRedirect("https://www.linkedin.com/jobs/view/4473530223"),
      }]),
    })

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["4473530223"])
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

  it("leaves web-crawled and LinkedIn pages to their bounded adapters while enriching other providers", async () => {
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
        {
          source: "onlinejobsph-email",
          sourceJobId: "1456789",
          url: "https://www.onlinejobs.ph/jobseekers/job/AI-Agent-Developer-1456789",
          sourceTimestampAt: null,
        },
      ],
      { fetchImpl, excludedSources: ["onlinejobsph-email"] },
    )

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.indeed.com/viewjob?jk=indeed-1",
      expect.any(Object),
    )
    expect(jobs[0].sourceTimestampAt).toBeNull()
    expect(jobs[1].sourceTimestampAt).toBe("2026-09-27T09:01:19.000Z")
    expect(jobs[2].sourceTimestampAt).toBeNull()
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
})
