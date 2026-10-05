import { describe, expect, it } from "vitest"
import { countJobsByWebsite } from "@/lib/website-job-counts"

describe("saved jobs by website", () => {
  it("combines email and web imports and counts jobs in every tracking state", () => {
    const jobs = [
      { source: "onlinejobsph", url: "https://www.onlinejobs.ph/jobseekers/job/first-1", applied_at: null, not_interested_at: null },
      { source: "onlinejobsph-email", url: "https://www.onlinejobs.ph/jobseekers/job/second-2", applied_at: "2026-10-05T00:00:00Z", not_interested_at: null },
      { source: "onlinejobsph", url: "https://www.onlinejobs.ph/jobseekers/job/third-3", applied_at: null, not_interested_at: "2026-10-05T00:00:00Z" },
      { source: "smileandhire", url: "https://www.smileandhire.com/jobs/123" },
    ]
    expect(countJobsByWebsite(jobs)).toEqual([
      { website: "onlinejobs.ph", count: 3 },
      { website: "smileandhire.com", count: 1 },
    ])
  })

  it("groups unlabelled imports by website and handles unusable URLs and unknown source names", () => {
    expect(countJobsByWebsite([
      { source: null, url: "https://www.example.com/jobs/1" },
      { source: "constructor", url: "https://example.com/jobs/2" },
      { source: "manual", url: "not a URL" },
      { source: null, url: "mailto:jobs@example.com" },
    ])).toEqual([
      { website: "example.com", count: 2 },
      { website: "Other", count: 2 },
    ])
  })
})
