-- Keep one SELECT policy per role while preserving public and owner access.
drop policy "Read public sync runs" on public.job_sync_runs;
drop policy "Read own sync runs" on public.job_sync_runs;

create policy "Read public sync runs" on public.job_sync_runs for select
  to anon using (user_id is null);
create policy "Read visible sync runs" on public.job_sync_runs for select
  to authenticated using (user_id is null or (select auth.uid()) = user_id);
