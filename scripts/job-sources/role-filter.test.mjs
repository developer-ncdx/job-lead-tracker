import { describe, expect, it } from "vitest"

import {
  evaluateTargetRole,
  matchesTargetRole,
} from "./role-filter.mjs"

describe("software-development role filter", () => {
  it("accepts configured and closely related software roles", () => {
    const acceptedTitles = [
      "Senior AI Engineer",
      "Bubble.io Developer",
      "Software Developer",
      "AI Agent Developer",
      "Agentic AI Engineer",
      "AI-Assisted Developer",
      "AI Specialist",
      "Automation Engineer",
      "Automation Developer",
      "Lead Programmer",
      "Software Engineering Lead",
      "Frontend Engineer",
      "Backend Developer",
      "Full-Stack Developer",
      "Mobile Application Developer",
      "Site Reliability Engineer",
      "DevOps Engineer",
      "Data Engineer",
      "Test Automation Engineer",
      "Software Architect",
      "Backend/API Engineer",
      "Cloud Security Engineer",
      "Forward Deployed Engineer",
      "Infrastructure Engineer",
      "Senior Product Engineer",
      "Staff Engineer, Payments",
      "C++ Engineer",
      "Programmer",
      "𝐒𝐞𝐧𝐢𝐨𝐫 𝐖𝐞𝐛 𝐃𝐞𝐯𝐞𝐥𝐨𝐩𝐞𝐫",
    ]

    for (const title of acceptedTitles) {
      expect(matchesTargetRole(title), title).toBe(true)
    }
  })

  it("rejects adjacent roles that are not software-development jobs", () => {
    const rejectedTitles = [
      "Sales Engineer",
      "AI Sales Engineer",
      "Technical Product Manager",
      "Software Sales Executive",
      "IT Support Specialist",
      "Data Analyst",
      "Marketing Automation Specialist",
      "Technical Recruiter",
      "AI Course Instructor",
      "Business Systems Analyst",
      "Business Systems Architect",
      "Engineering Project Manager",
      "Quality Assurance Specialist",
      "Enterprise Solutions Architect",
      "Product Analytics - Developer Experience",
      "GSI Partner Development Lead",
      "Staff Design Engineer",
      "[TEMPLATE] Integration Engineer",
    ]

    for (const title of rejectedTitles) {
      expect(evaluateTargetRole(title).matches, title).toBe(false)
    }
  })

  it("returns a stable family and rejection reason for diagnostics", () => {
    expect(evaluateTargetRole("Bubble Developer")).toEqual({
      matches: true,
      reason: "target_software_role",
      family: "bubble",
    })
    expect(evaluateTargetRole("")).toEqual({
      matches: false,
      reason: "missing_title",
      family: null,
    })
  })
})
