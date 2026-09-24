type SupabaseEnvironment = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

export type SupabaseConfigResult =
  | {
      ok: true
      url: string
      anonKey: string
    }
  | {
      ok: false
      message: string
    }

export function getSupabaseConfig(
  environment: SupabaseEnvironment,
): SupabaseConfigResult {
  const url = environment.VITE_SUPABASE_URL?.trim()
  const anonKey = environment.VITE_SUPABASE_ANON_KEY?.trim()
  const missingVariables = [
    !url && "VITE_SUPABASE_URL",
    !anonKey && "VITE_SUPABASE_ANON_KEY",
  ].filter(Boolean)

  if (!url || !anonKey) {
    return {
      ok: false,
      message: `Missing ${missingVariables.join(
        " and ",
      )}. Copy .env.example to .env.local and add your Supabase project values.`,
    }
  }

  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      throw new Error("Unsupported protocol")
    }
  } catch {
    return {
      ok: false,
      message:
        "VITE_SUPABASE_URL must be a valid HTTP(S) URL from your Supabase project settings.",
    }
  }

  return {
    ok: true,
    url,
    anonKey,
  }
}
