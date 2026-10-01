export function sanitizeHistoryError(value, environment = {}) {
  let message = value instanceof Error ? value.message : String(value ?? "")
  for (const [name, secret] of Object.entries(environment)) {
    if (
      /(KEY|PASSWORD|SECRET|TOKEN)/i.test(name) &&
      typeof secret === "string" &&
      secret.length > 0
    ) {
      message = message.split(secret).join("[redacted]")
    }
  }
  return message.slice(0, 1000)
}

export async function startSyncRun(client, userId, trigger) {
  const { data, error } = await client
    .from("job_sync_runs")
    .insert({ user_id: userId, trigger })
    .select("id")
    .abortSignal(AbortSignal.timeout(5000))
    .single()
  if (error || !data)
    throw new Error(error?.message ?? "No sync history row returned")
  return data.id
}

export async function finishSyncRun(client, id, values, environment) {
  const { data, error } = await client
    .from("job_sync_runs")
    .update({
      ...values,
      sources: (values.sources ?? []).map((source) => ({
        ...source,
        error: source.error
          ? sanitizeHistoryError(source.error, environment)
          : null,
      })),
      error_message: values.error_message
        ? sanitizeHistoryError(values.error_message, environment)
        : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id")
    .abortSignal(AbortSignal.timeout(5000))
    .single()
  if (error || !data)
    throw new Error(error?.message ?? "Sync history row was not updated")
}
