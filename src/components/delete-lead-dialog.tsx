import { useState } from "react"
import { LoaderCircle, Trash2, TriangleAlert } from "lucide-react"
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
import type { JobLead } from "@/lib/database.types"
import { getErrorMessage } from "@/lib/errors"

type DeleteLeadDialogProps = {
  lead: JobLead
  onDelete: (leadId: string) => Promise<void>
}

export function DeleteLeadDialog({
  lead,
  onDelete,
}: DeleteLeadDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    if (isDeleting) {
      return
    }

    setOpen(nextOpen)
    if (nextOpen) {
      setError(null)
    }
  }

  async function handleDelete() {
    setError(null)
    setIsDeleting(true)

    try {
      await onDelete(lead.id)
      setOpen(false)
      toast.success("Lead deleted")
    } catch (deleteError) {
      setError(
        getErrorMessage(
          deleteError,
          "We could not delete this lead. Please try again.",
        ),
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Delete ${lead.title}`}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle>Delete this lead?</DialogTitle>
          <DialogDescription>
            “{lead.title}” will be permanently removed from Supabase. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Keep lead
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting && <LoaderCircle className="animate-spin" />}
            {isDeleting ? "Deleting" : "Delete lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
