import { useState, type FormEvent } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ArrowRight,
  BriefcaseBusiness,
  DatabaseZap,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Database } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"

type AuthScreenProps = {
  client: SupabaseClient<Database>
}

export function AuthScreen({ client }: AuthScreenProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        throw signInError
      }
    } catch (signInError) {
      setError(
        getErrorMessage(
          signInError,
          "We could not sign you in. Check your details and try again.",
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-gradient-to-br from-sky-50 via-white to-blue-100/80">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(56,189,248,0.26),transparent_28%),radial-gradient(circle_at_88%_82%,rgba(99,102,241,0.17),transparent_32%)]" />
      <div className="pointer-events-none absolute -top-28 right-1/4 size-72 rounded-full bg-cyan-200/25 blur-3xl" />

      <div className="relative mx-auto grid min-h-svh max-w-6xl items-center gap-12 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_10px_25px_-10px_rgba(14,165,233,0.85)] ring-1 ring-white/70">
              <BriefcaseBusiness className="size-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Job Lead Tracker
            </span>
          </div>

          <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-sky-700 uppercase">
            A quieter way to stay organized
          </p>
          <h1 className="max-w-lg bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 bg-clip-text text-5xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance text-transparent">
            Every promising role, in one focused place.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-slate-600">
            Review the leads collected in Supabase, refine the details, and
            move on to the next opportunity.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/65 px-3 py-2 shadow-sm backdrop-blur">
              <DatabaseZap className="size-4 text-sky-600" />
              Live Supabase sync
            </div>
            <div className="flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/65 px-3 py-2 shadow-sm backdrop-blur">
              <ShieldCheck className="size-4 text-blue-600" />
              Private to your account
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 text-white shadow-[0_10px_25px_-10px_rgba(14,165,233,0.85)] ring-1 ring-white/70">
              <BriefcaseBusiness className="size-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Job Lead Tracker
            </span>
          </div>

          <Card className="gap-0 border-0 bg-gradient-to-br from-white/95 to-sky-50/90 py-0 shadow-[0_28px_80px_-34px_rgba(2,132,199,0.38)] ring-1 ring-sky-200/75 backdrop-blur-xl">
            <CardHeader className="gap-2 px-6 pt-7 pb-5 sm:px-8 sm:pt-8">
              <CardTitle className="text-2xl tracking-[-0.03em]">
                Welcome back
              </CardTitle>
              <CardDescription className="leading-6">
                Sign in with the account you created in Supabase.
              </CardDescription>
            </CardHeader>

            <CardContent className="px-6 pb-7 sm:px-8 sm:pb-8">
              <form className="space-y-5" onSubmit={handleSubmit}>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={isSubmitting}
                    required
                    autoFocus
                    className="h-10 border-sky-200 bg-white/85 focus-visible:ring-sky-400"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isSubmitting}
                    required
                    className="h-10 border-sky-200 bg-white/85 focus-visible:ring-sky-400"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="mt-1 h-10 w-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 text-white shadow-[0_12px_24px_-12px_rgba(37,99,235,0.8)] hover:from-sky-600 hover:via-blue-700 hover:to-indigo-700"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="animate-spin" />
                      Signing in
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight data-icon="inline-end" />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                This private tool does not offer public sign-up.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}
