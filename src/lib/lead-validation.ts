import type { JobLeadUpdate } from "@/lib/database.types"

export type LeadValidationErrors = Partial<
  Record<keyof JobLeadUpdate, string>
>

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function validateLead(
  values: JobLeadUpdate,
): LeadValidationErrors {
  const errors: LeadValidationErrors = {}

  if (!values.title.trim()) {
    errors.title = "Add a title so this lead is easy to recognize."
  }

  if (!values.url.trim()) {
    errors.url = "Add the job posting URL."
  } else if (!isHttpUrl(values.url.trim())) {
    errors.url = "Use a complete URL starting with http:// or https://."
  }

  return errors
}

export function normalizeLead(values: JobLeadUpdate): JobLeadUpdate {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    url: values.url.trim(),
  }
}
