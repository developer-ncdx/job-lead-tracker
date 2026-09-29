import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react"
import type { Session, SupabaseClient } from "@supabase/supabase-js"
import {
  AlertCircle,
  BriefcaseBusiness,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import { AuthScreen } from "@/components/auth-screen"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Toaster } from "@/components/ui/sonner"
import type { Database } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
import { supabase, supabaseConfigError } from "@/lib/supabase"

const LeadDashboard = lazy(() =>
  import("@/components/lead-dashboard").then((module) => ({
    default: module.LeadDashboard,
  })),
)

const PreviewLeadDashboard = lazy(() =>
  import("@/components/lead-dashboard").then((module) => ({
    default: module.PreviewLeadDashboard,
  })),
)

const PublicLeadDashboard = lazy(() =>
  import("@/components/lead-dashboard").then((module) => ({
    default: module.PublicLeadDashboard,
  })),
)

type ConnectedApplicationProps = {
  client: SupabaseClient<Database>
}

function LoadingScreen() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-100/80">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_12px_28px_-12px_rgba(14,165,233,0.85)]">
          <BriefcaseBusiness className="size-5" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Opening your leads
        </div>
      </div>
    </main>
  )
}

function ConnectedApplication({ client }: ConnectedApplicationProps) {
  const [session, setSession] = useState<Session | null>()
  const [authError, setAuthError] = useState<string | null>(null)

  const loadSession = useCallback(async () => {
    try {
      const {
        data,
        error: sessionError,
      } = await client.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      setAuthError(null)
      setSession(data.session)
    } catch (sessionError) {
      setAuthError(
        getErrorMessage(
          sessionError,
          "We could not restore your session. Please try again.",
        ),
      )
      setSession(null)
    }
  }, [client])

  useEffect(() => {
    let mounted = true

    // This effect intentionally synchronizes React with Supabase Auth.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setAuthError(null)
        setSession(nextSession)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [client, loadSession])

  if (session === undefined && !authError) {
    return <LoadingScreen />
  }

  if (authError) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-blue-100/80 px-5">
        <Card className="w-full max-w-md border-0 bg-white/90 shadow-[0_28px_80px_-34px_rgba(2,132,199,0.38)] ring-1 ring-sky-200/75 backdrop-blur">
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Could not start the tracker</AlertTitle>
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void loadSession()}
            >
              <RefreshCw />
              Try again
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  return session ? (
    <Suspense fallback={<LoadingScreen />}>
      <LeadDashboard client={client} session={session} />
    </Suspense>
  ) : (
    <AuthScreen client={client} />
  )
}

export default function Application() {
  if (!supabase || supabaseConfigError) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <PreviewLeadDashboard />
        </Suspense>
        <Toaster position="top-right" richColors closeButton />
      </>
    )
  }

  const authMode = String(
    import.meta.env.VITE_AUTH_MODE ?? "public",
  ).toLowerCase()

  return (
    <>
      {authMode === "authenticated" ? (
        <ConnectedApplication client={supabase} />
      ) : (
        <Suspense fallback={<LoadingScreen />}>
          <PublicLeadDashboard client={supabase} />
        </Suspense>
      )}
      <Toaster position="top-right" richColors closeButton />
    </>
  )
}
