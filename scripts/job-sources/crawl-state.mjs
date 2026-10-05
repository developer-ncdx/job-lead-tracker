import { randomUUID } from "node:crypto"

export async function claimCrawlState(client, source, userId, now = new Date()) {
  if (!client) return { cache: {}, save: async () => {}, finish: async () => {} }
  const { error: createError } = await client.from("job_crawl_states")
    .upsert({ source, user_id: userId }, { onConflict: "user_id,source", ignoreDuplicates: true })
  if (createError) throw new Error(`Crawler state is unavailable: ${createError.message}`)
  let read = client.from("job_crawl_states").select("*").eq("source", source)
  read = userId ? read.eq("user_id", userId) : read.is("user_id", null)
  const { data: state, error } = await read.single()
  if (error || !state) throw new Error(`Could not read crawler state: ${error?.message ?? "missing row"}`)
  if (Date.parse(state.cooldown_until) > now.getTime()) return { skipped: `Provider cooldown until ${state.cooldown_until}` }
  if (Date.parse(state.lease_until) > now.getTime()) return { skipped: "Another crawl is already running" }
  const token = randomUUID()
  let claim = client.from("job_crawl_states").update({
    lease_token: token,
    lease_until: new Date(now.getTime() + 10 * 60_000).toISOString(),
    last_started_at: now.toISOString(),
    updated_at: now.toISOString(),
  }).eq("id", state.id).eq("updated_at", state.updated_at)
  claim = state.lease_token ? claim.eq("lease_token", state.lease_token) : claim.is("lease_token", null)
  const claimed = await claim.select("id").maybeSingle()
  if (claimed.error) throw new Error(`Could not claim crawler state: ${claimed.error.message}`)
  if (!claimed.data) return { skipped: "Another crawl claimed this source" }
  const cache = state.cache ?? {}
  const save = async changes => {
    const { data, error: saveError } = await client.from("job_crawl_states")
      .update({ cache, updated_at: new Date().toISOString(), ...changes })
      .eq("id", state.id).eq("lease_token", token).select("id").maybeSingle()
    if (saveError || !data) throw new Error(`Could not save crawler state: ${saveError?.message ?? "crawl lease expired"}`)
  }
  return {
    cache,
    save: () => save({}),
    finish: async (failure = null) => {
      // Bound the private cache to the most recently observed 1,000 jobs.
      const retained = Object.entries(cache).sort((a, b) => Date.parse(b[1].seenAt) - Date.parse(a[1].seenAt)).slice(0, 1000)
      for (const id of Object.keys(cache)) delete cache[id]
      Object.assign(cache, Object.fromEntries(retained))
      await save({
        lease_token: null,
        lease_until: null,
        cooldown_until: failure?.cooldownUntil ?? null,
        last_error: failure ? failure.message.slice(0, 1000) : null,
        ...(!failure && { last_succeeded_at: new Date().toISOString() }),
      })
    },
  }
}

export async function captureCrawlResult(source, fetchJobs, { client, userId, now = new Date() } = {}) {
  const startedAt = Date.now()
  let state
  try {
    state = await claimCrawlState(client, source, userId ?? null, now)
    if (state.skipped) return { source, name: `${source}:web`, status: "skipped", jobs: [], error: state.skipped, durationMs: Date.now() - startedAt }
    const jobs = await fetchJobs(state)
    await state.finish()
    return { source, name: `${source}:web`, status: "ok", jobs, error: null, durationMs: Date.now() - startedAt }
  } catch (error) {
    if (state && !state.skipped) {
      try { await state.finish(error) } catch { /* Preserve the original failure; the lease expires automatically. */ }
    }
    return { source, name: `${source}:web`, status: "failed", jobs: [], error: error.message ?? String(error), durationMs: Date.now() - startedAt }
  }
}
