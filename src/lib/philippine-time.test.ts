import { describe, expect, it } from "vitest"

import {
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
})
