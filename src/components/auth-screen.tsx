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
    <main className="relative min-h-svh overflow-hidden bg-[#f6f4ef]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(231,154,85,0.16),transparent_28%),radial-gradient(circle_at_90%_85%,rgba(116,133,99,0.12),transparent_32%)]" />

      <div className="relative mx-auto grid min-h-svh max-w-6xl items-center gap-12 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-10 flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#d96f32] text-white shadow-sm">
              <BriefcaseBusiness className="size-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Job Lead Tracker
            </span>
          </div>

          <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-[#a34f25] uppercase">
            A quieter way to stay organized
          </p>
          <h1 className="max-w-lg text-5xl leading-[1.05] font-semibold tracking-[-0.045em] text-balance text-[#302820]">
            Every promising role, in one focused place.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-[#6e6257]">
            Review the leads collected in Supabase, refine the details, and
            move on to the next opportunity.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 text-sm text-[#5d534a]">
            <div className="flex items-center gap-2 rounded-full border border-[#ded8ce] bg-white/65 px-3 py-2">
              <DatabaseZap className="size-4 text-[#b85d2c]" />
              Live Supabase sync
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#ded8ce] bg-white/65 px-3 py-2">
              <ShieldCheck className="size-4 text-[#6e7c60]" />
              Private to your account
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#d96f32] text-white shadow-sm">
              <BriefcaseBusiness className="size-5" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold tracking-tight">
              Job Lead Tracker
            </span>
          </div>

          <Card className="gap-0 border-0 bg-white/92 py-0 shadow-[0_24px_70px_-30px_rgba(62,45,31,0.35)] ring-1 ring-black/6 backdrop-blur">
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
                    className="h-10 bg-white"
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
                    className="h-10 bg-white"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  className="mt-1 h-10 w-full bg-[#3c332b] hover:bg-[#4b4037]"
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
