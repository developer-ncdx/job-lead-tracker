import { AlertTriangle, BriefcaseBusiness, FileKey2 } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type ConfigurationScreenProps = {
  message: string
}

export function ConfigurationScreen({
  message,
}: ConfigurationScreenProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#f6f4ef] px-5 py-12">
      <Card className="w-full max-w-lg gap-0 border-0 bg-white py-0 shadow-[0_24px_70px_-32px_rgba(62,45,31,0.3)] ring-1 ring-black/6">
        <CardHeader className="gap-3 px-6 pt-7 pb-5 sm:px-8 sm:pt-8">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#f3e5d8] text-[#b85d2c]">
            <FileKey2 className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <CardTitle className="text-xl tracking-[-0.025em]">
              Connect Supabase
            </CardTitle>
            <CardDescription className="leading-6">
              The tracker needs your project URL and browser-safe key before it
              can start.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-7 sm:px-8 sm:pb-8">
          <Alert className="border-amber-200 bg-amber-50/80 text-amber-950">
            <AlertTriangle className="text-amber-700" />
            <AlertTitle>Configuration required</AlertTitle>
            <AlertDescription className="text-amber-900/75">
              {message}
            </AlertDescription>
          </Alert>

          <div className="rounded-xl border bg-[#faf9f6] p-4 text-sm">
            <p className="mb-2 font-medium">Expected in .env.local</p>
            <code className="block break-all font-mono text-xs leading-6 text-muted-foreground">
              VITE_SUPABASE_URL=...
              <br />
              VITE_SUPABASE_ANON_KEY=...
            </code>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BriefcaseBusiness className="size-3.5" />
            See README.md for the complete setup.
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
