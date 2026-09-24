import { describe, expect, it } from "vitest"

import { getSupabaseConfig } from "@/lib/env"

describe("getSupabaseConfig", () => {
  it("reports every missing Supabase variable", () => {
    const result = getSupabaseConfig({})

    expect(result).toEqual({
      ok: false,
      message:
        "Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and add your Supabase project values.",
    })
  })

  it("rejects an invalid project URL", () => {
    const result = getSupabaseConfig({
      VITE_SUPABASE_URL: "not-a-url",
      VITE_SUPABASE_ANON_KEY: "public-key",
    })

    expect(result).toEqual({
      ok: false,
      message:
        "VITE_SUPABASE_URL must be a valid HTTP(S) URL from your Supabase project settings.",
    })
  })

  it("returns trimmed valid values", () => {
    const result = getSupabaseConfig({
      VITE_SUPABASE_URL: " https://example.supabase.co ",
      VITE_SUPABASE_ANON_KEY: " public-key ",
    })

    expect(result).toEqual({
      ok: true,
      url: "https://example.supabase.co",
      anonKey: "public-key",
    })
  })
})
