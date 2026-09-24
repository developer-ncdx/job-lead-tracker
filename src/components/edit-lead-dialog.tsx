import { useState, type FormEvent } from "react"
import { LoaderCircle, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { JobLead, JobLeadUpdate } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"
import {
  normalizeLead,
  validateLead,
  type LeadValidationErrors,
} from "@/lib/lead-validation"

type EditLeadDialogProps = {
  lead: JobLead
  onUpdate: (leadId: string, values: JobLeadUpdate) => Promise<void>
}

export function EditLeadDialog({
  lead,
  onUpdate,
}: EditLeadDialogProps) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<JobLeadUpdate>({
    title: lead.title,
    description: lead.description,
    url: lead.url,
  })
  const [errors, setErrors] = useState<LeadValidationErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (isSaving) {
      return
    }

    setOpen(nextOpen)

    if (nextOpen) {
      setValues({
        title: lead.title,
        description: lead.description,
        url: lead.url,
      })
      setErrors({})
      setSubmitError(null)
    }
  }

  function setField<Key extends keyof JobLeadUpdate>(
    field: Key,
    value: JobLeadUpdate[Key],
  ) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextValues = normalizeLead(values)
    const validationErrors = validateLead(nextValues)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setSubmitError(null)
    setIsSaving(true)

    try {
      await onUpdate(lead.id, nextValues)
      setOpen(false)
      toast.success("Lead updated")
    } catch (updateError) {
      setSubmitError(
        getErrorMessage(
          updateError,
          "We could not update this lead. Please try again.",
        ),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Edit ${lead.title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil />
          <span className="hidden sm:inline">Edit</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Edit job lead</DialogTitle>
            <DialogDescription>
              Update the job title or posting link.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-5">
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor={`title-${lead.id}`}>Title</Label>
              <Input
                id={`title-${lead.id}`}
                value={values.title}
                onChange={(event) => setField("title", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={
                  errors.title ? `title-error-${lead.id}` : undefined
                }
                autoFocus
              />
              {errors.title && (
                <p
                  id={`title-error-${lead.id}`}
                  className="text-xs text-destructive"
                >
                  {errors.title}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor={`url-${lead.id}`}>Job posting URL</Label>
              <Input
                id={`url-${lead.id}`}
                type="url"
                value={values.url}
                onChange={(event) => setField("url", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(errors.url)}
                aria-describedby={
                  errors.url ? `url-error-${lead.id}` : undefined
                }
                placeholder="https://..."
              />
              {errors.url && (
                <p
                  id={`url-error-${lead.id}`}
                  className="text-xs text-destructive"
                >
                  {errors.url}
                </p>
              )}
            </div>

          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <LoaderCircle className="animate-spin" />}
              {isSaving ? "Saving" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
