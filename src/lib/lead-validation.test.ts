import { describe, expect, it } from "vitest"

import {
  isHttpUrl,
  normalizeLead,
  validateLead,
} from "@/lib/lead-validation"

describe("lead validation", () => {
  it("accepts only complete HTTP(S) URLs", () => {
    expect(isHttpUrl("https://example.com/jobs/123")).toBe(true)
    expect(isHttpUrl("http://localhost:3000/job")).toBe(true)
    expect(isHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isHttpUrl("example.com/job")).toBe(false)
  })

  it("requires a title and valid URL", () => {
    expect(
      validateLead({
        title: " ",
        description: "",
        url: "example.com",
      }),
    ).toEqual({
      title: "Add a title so this lead is easy to recognize.",
      url: "Use a complete URL starting with http:// or https://.",
    })
  })

  it("normalizes user-entered whitespace before saving", () => {
    expect(
      normalizeLead({
        title: "  Product Designer  ",
        description: "  Remote role  ",
        url: "  https://example.com/job  ",
      }),
    ).toEqual({
      title: "Product Designer",
      description: "Remote role",
      url: "https://example.com/job",
    })
  })
})
