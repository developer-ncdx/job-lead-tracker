import { describe, expect, it } from "vitest"
import { buildSupabaseRows } from "../job-sources/sync-utils.mjs"
import { planOnlineJobsImport } from "./import-onlinejobs.mjs"

function savedJob(overrides = {}) {
  return {
    sourceId: "123",
    url: "https://www.onlinejobs.ph/jobseekers/job/automation-specialist-123",
    title: "Automation Specialist",
    description: "Build workflow automations from home.",
    employmentType: "Full Time",
    salary: "$10/hr",
    hoursPerWeek: "40",
    dateUpdated: "Oct 5, 2026",
    ...overrides,
  }
}

describe("saved OnlineJobs.ph imports", () => {
  it("rechecks the current role and remote filters instead of trusting saved matches", () => {
    const plan = planOnlineJobsImport([
      savedJob({ matchesTargetRole: false }),
      savedJob({ sourceId: "124", url: "https://www.onlinejobs.ph/jobseekers/job/ai-engineer-124", title: "AI Engineer", description: "WORK SET UP: Onsite in Manila", matchesTargetRole: true }),
      savedJob({ sourceId: "125", url: "https://www.onlinejobs.ph/jobseekers/job/marketing-125", title: "Marketing Specialist", matchesTargetRole: true }),
    ])
    expect(plan.jobs.map(job => job.sourceJobId)).toEqual(["123"])
    expect(plan.skipped.map(job => job.reason)).toEqual(["not_remote_only", "outside_target_roles"])
  })

  it("skips existing jobs across sources and changed URL slugs without changing their tracking", () => {
    const existing = [{ source: "onlinejobsph-email", source_job_id: "123", url: "https://onlinejobs.ph/jobseekers/job/old-slug-123", applied_at: "2026-10-05T12:00:00Z", not_interested_at: null, is_read: true }]
    const before = structuredClone(existing)
    expect(planOnlineJobsImport([savedJob()], existing)).toMatchObject({ jobs: [], skipped: [{ reason: "already_present" }] })
    expect(existing).toEqual(before)
    expect(planOnlineJobsImport([savedJob(), savedJob({ url: "https://www.onlinejobs.ph/jobseekers/job/new-slug-123" })]).jobs).toHaveLength(1)
  })

  it("rejects invalid job URLs and mismatched IDs before writing", () => {
    expect(() => planOnlineJobsImport([savedJob({ url: "https://example.com/jobseekers/job/automation-123" })])).toThrow("Invalid saved")
    expect(() => planOnlineJobsImport([savedJob({ sourceId: "999" })])).toThrow("Invalid saved")
    expect(() => planOnlineJobsImport(undefined)).toThrow("jobs array")
  })

  it("preserves the update date as a label and omits all user tracking fields", () => {
    const { jobs } = planOnlineJobsImport([savedJob()])
    const [row] = buildSupabaseRows(jobs, null)
    expect(row).toMatchObject({ user_id: null, source: "onlinejobsph", source_job_id: "123", source_timestamp_at: null, source_timestamp_kind: "updated", source_timestamp_label: "Updated Oct 5, 2026" })
    expect(row.description).toContain("Salary: $10/hr")
    for (const field of ["is_priority", "is_read", "applied_at", "not_interested_at"]) expect(row).not.toHaveProperty(field)
  })
})
