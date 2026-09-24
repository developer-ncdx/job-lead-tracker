import { describe, expect, it } from "vitest"

import {
  canonicalizeUrl,
  normalizeSourceJobId,
  normalizeTimestamp,
} from "./shared.mjs"

describe("shared job-source normalization", () => {
  it("normalizes ISO, Unix-second, and Unix-millisecond timestamps", () => {
    expect(normalizeTimestamp("2026-09-24T00:00:00Z")).toBe(
      "2026-09-24T00:00:00.000Z",
    )
    expect(normalizeTimestamp(1_758_528_000)).toBe(
      "2025-09-22T08:00:00.000Z",
    )
    expect(normalizeTimestamp(1_758_528_000_000)).toBe(
      "2025-09-22T08:00:00.000Z",
    )
    expect(normalizeTimestamp("not-a-date")).toBeNull()
  })

  it("normalizes identifiers without turning missing values into text", () => {
    expect(normalizeSourceJobId(42)).toBe("42")
    expect(normalizeSourceJobId(" job-1 ")).toBe("job-1")
    expect(normalizeSourceJobId(undefined)).toBe("")
    expect(normalizeSourceJobId(null)).toBe("")
  })

  it("keeps safe HTTP(S) URLs and rejects unusable URLs", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/job/1?utm_source=test&department=engineering#apply",
      ),
    ).toBe("https://example.com/job/1?department=engineering")
    expect(canonicalizeUrl("javascript:alert(1)")).toBe("")
    expect(canonicalizeUrl("not-a-url")).toBe("")
  })
})
