import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"
import { getSupabaseConfig } from "@/lib/env"

const config = getSupabaseConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

export const supabaseConfigError = config.ok ? null : config.message

export const supabase: SupabaseClient<Database> | null = config.ok
  ? createClient<Database>(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      global: {
        headers: {
          "X-Client-Info": "job-lead-tracker",
        },
      },
    })
  : null
