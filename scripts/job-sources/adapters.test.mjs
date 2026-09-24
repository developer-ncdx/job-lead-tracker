import { describe, expect, it } from "vitest"

import { normalizeAshbyJob } from "./ashby.mjs"
import { normalizeGreenhouseJob } from "./greenhouse.mjs"
import { normalizeHimalayasJob } from "./himalayas.mjs"
import { normalizeJobicyJob } from "./jobicy.mjs"
import { normalizeJoobleJob } from "./jooble.mjs"
import { normalizeLeverJob } from "./lever.mjs"
import { normalizeRemotiveJob } from "./remotive.mjs"
import { normalizeRemoteOkJob } from "./remote-ok.mjs"
import { normalizeWeWorkRemotelyJob } from "./we-work-remotely.mjs"

describe("job source normalization", () => {
  it("normalizes Greenhouse publication metadata", () => {
    const job = normalizeGreenhouseJob(
      {
        id: 42,
        title: "AI Engineer",
        company_name: "Acme",
        content: "<p>Build &amp; deploy agents.</p>",
        absolute_url: "https://example.com/job/42?utm_source=test",
        location: { name: "Remote" },
        first_published: "2026-09-20T08:30:00Z",
        updated_at: "2026-09-21T08:30:00Z",
      },
      { board: "https://boards.greenhouse.io/acme" },
    )

    expect(job).toMatchObject({
      source: "greenhouse",
      sourceJobId: "42",
      company: "Acme",
      description: "Build & deploy agents.",
      location: "Remote",
      isRemote: true,
      sourceTimestampAt: "2026-09-20T08:30:00.000Z",
      sourceTimestampKind: "published",
    })
    expect(job.url).toBe("https://example.com/job/42")
  })

  it("labels Greenhouse fallback timestamps as updated", () => {
    const job = normalizeGreenhouseJob(
      {
        id: 43,
        title: "Software Engineer",
        absolute_url: "https://example.com/job/43",
        first_published: "invalid",
        updated_at: "2026-09-22T08:30:00Z",
      },
      { board: "https://boards.greenhouse.io/acme" },
    )

    expect(job).toMatchObject({
      sourceTimestampAt: "2026-09-22T08:30:00.000Z",
      sourceTimestampKind: "updated",
    })
  })

  it("normalizes Ashby remote and secondary locations", () => {
    const job = normalizeAshbyJob(
      {
        id: "ashby-1",
        title: "Software Engineer",
        location: "New York",
        secondaryLocations: [{ location: "London" }],
        isRemote: true,
        descriptionPlain: "Build the product.",
        publishedAt: "2026-09-21T10:00:00+00:00",
        jobUrl: "https://jobs.ashbyhq.com/acme/ashby-1",
      },
      { board: "https://jobs.ashbyhq.com/acme", company: "Acme" },
    )

    expect(job).toMatchObject({
      source: "ashby",
      sourceJobId: "ashby-1",
      location: "New York | London",
      isRemote: true,
      sourceTimestampAt: "2026-09-21T10:00:00.000Z",
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Lever millisecond timestamps and full descriptions", () => {
    const job = normalizeLeverJob(
      {
        id: "lever-1",
        text: "Lead Programmer",
        createdAt: 1_758_528_000_000,
        workplaceType: "remote",
        hostedUrl: "https://jobs.lever.co/acme/lever-1",
        descriptionPlain: "Lead delivery.",
        lists: [{ text: "Requirements", content: "Node.js" }],
        categories: {
          location: "Worldwide",
          allLocations: ["Worldwide"],
        },
      },
      { board: "https://jobs.lever.co/acme", company: "Acme" },
    )

    expect(job).toMatchObject({
      source: "lever",
      sourceJobId: "lever-1",
      isRemote: true,
      sourceTimestampAt: "2025-09-22T08:00:00.000Z",
      sourceTimestampKind: "created",
    })
    expect(job.description).toContain("Requirements")
    expect(job.description).toContain("Node.js")
  })

  it("normalizes Jooble update timestamps without treating them as published", () => {
    const job = normalizeJoobleJob({
      id: 123,
      title: "Automation Developer",
      company: "Acme",
      location: "Remote",
      snippet: "Build workflow automation.",
      link: "https://example.com/jobs/123",
      updated: "2026-09-23T11:20:00Z",
    })

    expect(job).toMatchObject({
      source: "jooble",
      sourceJobId: "123",
      isRemote: true,
      sourceTimestampAt: "2026-09-23T11:20:00.000Z",
      sourceTimestampKind: "updated",
    })
  })

  it("normalizes We Work Remotely listings and separates company names", () => {
    const job = normalizeWeWorkRemotelyJob({
      title: "Acme: Senior Full-Stack Developer",
      region: "Anywhere in the World",
      description: "<p>Build web products.</p>",
      pubDate: "Thu, 24 Sep 2026 04:55:08 +0000",
      guid: "https://weworkremotely.com/remote-jobs/acme-developer",
      link: "https://weworkremotely.com/remote-jobs/acme-developer",
    })

    expect(job).toMatchObject({
      source: "weworkremotely",
      company: "Acme",
      title: "Senior Full-Stack Developer",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Remotive jobs", () => {
    const job = normalizeRemotiveJob({
      id: 21,
      title: "Backend Engineer",
      company_name: "Acme",
      description: "<p>Build APIs.</p>",
      url: "https://remotive.com/jobs/21",
      candidate_required_location: "Worldwide",
      publication_date: "2026-09-24T04:55:08Z",
    })

    expect(job).toMatchObject({
      source: "remotive",
      sourceJobId: "21",
      description: "Build APIs.",
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Remote OK jobs", () => {
    const job = normalizeRemoteOkJob({
      id: "22",
      position: "Frontend Engineer",
      company: "Acme",
      description: "<p>Build interfaces.</p>",
      url: "https://remoteok.com/remote-jobs/22",
      location: "Remote",
      epoch: 1_790_241_308,
    })

    expect(job).toMatchObject({
      source: "remoteok",
      sourceJobId: "22",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Jobicy namespaced RSS fields", () => {
    const job = normalizeJobicyJob({
      id: "23",
      title: "AI Developer",
      link: "https://jobicy.com/jobs/23",
      pubDate: "Thu, 24 Sep 2026 04:55:08 +0000",
      "content:encoded": "<p>Build AI tools.</p>",
      "job_listing:location": "Anywhere",
      "job_listing:company": "Acme",
    })

    expect(job).toMatchObject({
      source: "jobicy",
      company: "Acme",
      description: "Build AI tools.",
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Himalayas epoch timestamps", () => {
    const job = normalizeHimalayasJob({
      guid: "https://himalayas.app/companies/acme/jobs/engineer",
      applicationLink:
        "https://himalayas.app/companies/acme/jobs/engineer",
      title: "Software Engineer",
      companyName: "Acme",
      description: "<p>Build software.</p>",
      locationRestrictions: ["Worldwide"],
      pubDate: 1_790_241_308,
    })

    expect(job).toMatchObject({
      source: "himalayas",
      location: "Worldwide",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })
})
