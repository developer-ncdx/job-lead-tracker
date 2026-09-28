import { describe, expect, it, vi } from "vitest"

import {
  fetchArbeitnowJobs,
  normalizeArbeitnowJob,
} from "./arbeitnow.mjs"
import { normalizeAshbyJob } from "./ashby.mjs"
import { normalizeAylaJob } from "./ayla.mjs"
import { fetchEuresJobs, normalizeEuresJob } from "./eures.mjs"
import { normalizeGreenhouseJob } from "./greenhouse.mjs"
import { normalizeHimalayasJob } from "./himalayas.mjs"
import { normalizeJobicyJob } from "./jobicy.mjs"
import { fetchJobTechJobs, normalizeJobTechJob } from "./jobtech.mjs"
import { normalizeJoobleJob } from "./jooble.mjs"
import { normalizeLeverJob } from "./lever.mjs"
import { normalizeNomado24Job } from "./nomado24.mjs"
import {
  fetchPersonioJobs,
  normalizePersonioJob,
} from "./personio.mjs"
import { normalizeRemotiveJob } from "./remotive.mjs"
import { normalizeRemoteOkJob } from "./remote-ok.mjs"
import { normalizeSmartRecruitersJob } from "./smartrecruiters.mjs"
import { fetchTheMuseJobs, normalizeTheMuseJob } from "./the-muse.mjs"
import { normalizeWeWorkRemotelyJob } from "./we-work-remotely.mjs"
import { normalizeWorkableJob } from "./workable.mjs"

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function textResponse(payload) {
  return new Response(payload, {
    status: 200,
    headers: { "content-type": "application/xml" },
  })
}

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

  it("normalizes Arbeitnow creation metadata", () => {
    const job = normalizeArbeitnowJob({
      slug: "senior-backend-engineer",
      company_name: "Acme",
      title: "Senior Backend Engineer",
      description: "<p>Build APIs.</p>",
      remote: true,
      url: "https://www.arbeitnow.com/jobs/acme/backend",
      location: "Berlin, Germany",
      created_at: 1_790_241_308,
    })

    expect(job).toMatchObject({
      source: "arbeitnow",
      sourceJobId: "senior-backend-engineer",
      company: "Acme",
      description: "Build APIs.",
      isRemote: true,
      sourceTimestampKind: "created",
    })
  })

  it("normalizes The Muse locations and publication metadata", () => {
    const job = normalizeTheMuseJob({
      id: 31,
      name: "Software Engineer",
      contents: "<p>Build remotely.</p>",
      publication_date: "2026-09-24T04:55:08Z",
      locations: [{ name: "Flexible / Remote" }],
      categories: [{ name: "Software Engineering" }],
      refs: { landing_page: "https://www.themuse.com/jobs/acme/engineer" },
      company: { name: "Acme" },
    })

    expect(job).toMatchObject({
      source: "themuse",
      sourceJobId: "31",
      company: "Acme",
      location: "Flexible / Remote",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })

  it("normalizes JobTech publication and Swedish remote metadata", () => {
    const job = normalizeJobTechJob({
      id: "32",
      headline: "Software Developer",
      webpage_url: "https://arbetsformedlingen.se/platsbanken/annonser/32",
      publication_date: "2026-09-24T04:55:08",
      employer: { workplace: "Acme Sweden" },
      workplace_model: { label: "Distansarbete" },
      workplace_address: {
        city: "Stockholm",
        municipality: "Stockholm",
        region: "Stockholms län",
        country: "Sverige",
      },
      description: { text: "Build software." },
    })

    expect(job).toMatchObject({
      source: "jobtech",
      sourceJobId: "32",
      company: "Acme Sweden",
      location: "Stockholm, Stockholms län, Sverige",
      isRemote: true,
      sourceTimestampAt: "2026-09-24T02:55:08.000Z",
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Ayla government source links", () => {
    const job = normalizeAylaJob({
      id: "ayla-1",
      title: "Software Engineer",
      agency: "Public Agency",
      locationText: "Remote, USA",
      workArrangement: "remote",
      sourceUrl: "https://agency.example/jobs/1",
      postedDate: "2026-09-24T04:55:08Z",
    })

    expect(job).toMatchObject({
      source: "ayla",
      sourceJobId: "ayla-1",
      company: "Public Agency",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Nomado24 publication metadata", () => {
    const job = normalizeNomado24Job({
      slug: "nomado-1",
      title: "Backend Developer",
      companyName: "Acme",
      location: "Remote EU",
      remote: true,
      publishedAt: "2026-09-24T04:55:08Z",
      url: "https://www.nomado24.de/en/remote-jobs/job/nomado-1",
    })

    expect(job).toMatchObject({
      source: "nomado24",
      sourceJobId: "nomado-1",
      company: "Acme",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })

  it("normalizes EURES creation metadata and portal links", () => {
    const job = normalizeEuresJob({
      id: "encoded-id",
      title: "Software Developer",
      description: "<p>Build software remotely.</p>",
      creationDate: 1_790_241_308_000,
      locationMap: { DE: ["DE1"] },
      employer: { name: "Acme Europe" },
    })

    expect(job).toMatchObject({
      source: "eures",
      sourceJobId: "encoded-id",
      company: "Acme Europe",
      location: "DE",
      isRemote: true,
      sourceTimestampKind: "created",
    })
    expect(job.url).toContain("/jv-details/encoded-id")
  })

  it("normalizes SmartRecruiters public postings", () => {
    const job = normalizeSmartRecruitersJob(
      {
        id: "sr-1",
        name: "AI Engineer",
        company: { identifier: "Acme", name: "Acme" },
        releasedDate: "2026-09-24T04:55:08Z",
        location: {
          fullLocation: "Remote, USA",
          remote: true,
        },
      },
      { board: "Acme" },
    )

    expect(job).toMatchObject({
      source: "smartrecruiters",
      sourceJobId: "sr-1",
      company: "Acme",
      isRemote: true,
      sourceTimestampKind: "published",
    })
    expect(job.url).toContain("/Acme/sr-1-ai-engineer")
  })

  it("does not classify hybrid arrangements as remote", () => {
    expect(
      normalizeSmartRecruitersJob({
        id: "sr-hybrid",
        name: "Software Engineer",
        company: { identifier: "Acme", name: "Acme" },
        location: { fullLocation: "Manila", hybrid: true },
      }).isRemote,
    ).toBe(false)
    expect(
      normalizeAylaJob({
        id: "ayla-hybrid",
        title: "Software Engineer",
        locationText: "Manila",
        workArrangement: "hybrid",
      }).isRemote,
    ).toBe(false)
    expect(
      normalizeAylaJob({
        id: "ayla-remote-eligible",
        title: "Software Engineer",
        locationText: "Manila",
        workArrangement: "Remote Eligible",
      }).isRemote,
    ).toBe(false)
    expect(
      normalizeNomado24Job({
        slug: "nomado-hybrid",
        title: "Software Engineer",
        location: "Berlin",
        workArrangement: "hybrid",
      }).isRemote,
    ).toBe(false)
  })

  it("does not infer remote work from descriptions or loose flags", () => {
    expect(
      normalizeGreenhouseJob(
        {
          id: "gh-office",
          title: "Software Engineer",
          location: { name: "Seattle" },
          content: "Work with a distributed remote team.",
          absolute_url: "https://example.com/gh-office",
        },
        { board: "acme" },
      ).isRemote,
    ).toBe(false)
    expect(
      normalizeWorkableJob({
        shortcode: "workable-office",
        title: "Software Engineer",
        city: "Irvine",
        description: "Remote diagnostics experience is useful.",
      }).isRemote,
    ).toBe(false)
    expect(
      normalizeTheMuseJob({
        id: "muse-office",
        name: "Software Engineer",
        locations: [{ name: "Sunnyvale, CA" }],
        contents: "Collaborate with remote teams.",
      }).isRemote,
    ).toBe(false)
    expect(
      normalizeSmartRecruitersJob({
        id: "sr-loose-remote",
        name: "Software Engineer",
        location: { fullLocation: "Budapest", remote: true },
      }).isRemote,
    ).toBe(false)
  })

  it("normalizes Workable publication metadata", () => {
    const job = normalizeWorkableJob(
      {
        shortcode: "workable-1",
        title: "Frontend Developer",
        description: "<p>Build interfaces.</p>",
        url: "https://apply.workable.com/j/workable-1",
        published_on: "2026-09-24",
        telecommuting: true,
        city: "London",
        country: "United Kingdom",
      },
      { company: "Acme" },
    )

    expect(job).toMatchObject({
      source: "workable",
      sourceJobId: "workable-1",
      company: "Acme",
      description: "Build interfaces.",
      isRemote: true,
      sourceTimestampKind: "published",
    })
  })

  it("normalizes Personio XML fields", () => {
    const job = normalizePersonioJob(
      {
        id: "personio-1",
        name: "Automation Engineer",
        subcompany: "Acme GmbH",
        office: "Remote",
        createdAt: "2026-09-24T04:55:08Z",
        jobDescriptions: {
          jobDescription: {
            name: "Your mission",
            value: "<p>Build automation.</p>",
          },
        },
      },
      { board: "acme", company: "Acme" },
    )

    expect(job).toMatchObject({
      source: "personio",
      sourceJobId: "personio-1",
      company: "Acme GmbH",
      isRemote: true,
      sourceTimestampKind: "created",
    })
    expect(job.description).toContain("Your mission")
    expect(job.description).toContain("Build automation.")
  })

  it("paginates Arbeitnow until its configured limit", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              slug: "job-1",
              title: "Software Engineer",
              url: "https://example.com/jobs/1",
            },
          ],
          links: { next: "https://example.com/page/2" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              slug: "job-2",
              title: "Backend Developer",
              url: "https://example.com/jobs/2",
            },
          ],
          links: { next: null },
        }),
      )

    const jobs = await fetchArbeitnowJobs(
      { endpoint: "https://example.com/jobs", pages: 3 },
      { fetchImpl },
    )

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["job-1", "job-2"])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("paginates and deduplicates The Muse category results", async () => {
    const museJob = {
      id: 41,
      name: "Software Engineer",
      refs: { landing_page: "https://example.com/jobs/41" },
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ results: [museJob], page_count: 2 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [museJob], page_count: 2 }),
      )

    const jobs = await fetchTheMuseJobs(
      {
        endpoint: "https://example.com/jobs",
        categories: ["Software Engineering"],
        pages: 2,
      },
      {
        fetchImpl,
        environment: { THE_MUSE_API_KEY: "test-key" },
      },
    )

    expect(jobs).toHaveLength(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[0][0])).toContain("api_key=test-key")
  })

  it("paginates JobTech query results", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          total: { value: 2 },
          hits: [
            {
              id: "51",
              headline: "Software Engineer",
              webpage_url: "https://example.com/jobs/51",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          total: { value: 2 },
          hits: [
            {
              id: "52",
              headline: "Backend Developer",
              webpage_url: "https://example.com/jobs/52",
            },
          ],
        }),
      )

    const jobs = await fetchJobTechJobs(
      {
        endpoint: "https://example.com/jobs",
        queries: ["software"],
        pages: 2,
        pageSize: 1,
      },
      { fetchImpl },
    )

    expect(jobs.map((job) => job.sourceJobId)).toEqual(["51", "52"])
    expect(String(fetchImpl.mock.calls[1][0])).toContain("offset=1")
  })

  it("paginates EURES with POST request bodies", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          numberRecords: 2,
          jvs: [
            {
              id: "eures-1",
              title: "Software Engineer",
              employer: { name: "Acme" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          numberRecords: 2,
          jvs: [
            {
              id: "eures-2",
              title: "Backend Developer",
              employer: { name: "Acme" },
            },
          ],
        }),
      )

    const jobs = await fetchEuresJobs(
      {
        endpoint: "https://example.com/eures",
        queries: ["software"],
        pages: 2,
        pageSize: 1,
      },
      { fetchImpl },
    )

    expect(jobs.map((job) => job.sourceJobId)).toEqual([
      "eures-1",
      "eures-2",
    ])
    expect(fetchImpl.mock.calls[0][1].method).toBe("POST")
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).page).toBe(2)
  })

  it("parses Personio XML feeds", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <workzag-jobs>
        <position>
          <id>personio-2</id>
          <name>Software Engineer</name>
          <office>Berlin</office>
          <createdAt>2026-09-24T04:55:08Z</createdAt>
          <jobDescriptions>
            <jobDescription>
              <name>Your mission</name>
              <value><![CDATA[<p>Build software.</p>]]></value>
            </jobDescription>
          </jobDescriptions>
        </position>
      </workzag-jobs>`
    const jobs = await fetchPersonioJobs(
      { board: "acme", company: "Acme", language: "en" },
      { fetchImpl: vi.fn().mockResolvedValue(textResponse(xml)) },
    )

    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      source: "personio",
      sourceJobId: "personio-2",
      title: "Software Engineer",
      sourceTimestampKind: "created",
    })
    expect(jobs[0].description).toContain("Build software.")
  })

  it("rejects malformed public API payloads", async () => {
    await expect(
      fetchArbeitnowJobs(
        { endpoint: "https://example.com/jobs", pages: 1 },
        { fetchImpl: vi.fn().mockResolvedValue(jsonResponse({})) },
      ),
    ).rejects.toThrow("Arbeitnow returned an invalid jobs payload.")
  })
})
