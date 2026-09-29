import { describe, expect, it } from "vitest"

import {
  estimateRelativeDate,
  formatPhilippineDate,
  formatPhilippineDateTime,
  formatPhilippineTime,
} from "@/lib/philippine-time"

describe("Philippine time formatting", () => {
  it("converts UTC instants to Philippine time", () => {
    expect(formatPhilippineDateTime("2026-09-28T13:24:32.000Z")).toBe(
      "Sep 28, 2026, 9:24 PM PHT",
    )
    expect(formatPhilippineTime("2026-09-28T13:37:35.000Z")).toBe(
      "9:37 PM PHT",
    )
  })

  it("formats Philippine calendar dates without inventing a time", () => {
    expect(formatPhilippineDate("2026-09-29T19:40:00.000Z")).toBe(
      "Sep 30, 2026",
    )
  })

  it("estimates calendar dates from LinkedIn relative labels", () => {
    const observedAt = "2026-09-29T19:40:00.000Z"

    expect(
      estimateRelativeDate("5 days ago", observedAt)?.toISOString(),
    ).toBe("2026-09-24T19:40:00.000Z")
    expect(
      estimateRelativeDate("5日前", observedAt)?.toISOString(),
    ).toBe("2026-09-24T19:40:00.000Z")
    expect(
      estimateRelativeDate("1 linggo nakalipas", observedAt)?.toISOString(),
    ).toBe("2026-09-22T19:40:00.000Z")
    expect(
      estimateRelativeDate("6 hours ago", observedAt)?.toISOString(),
    ).toBe("2026-09-29T13:40:00.000Z")
  })
})
