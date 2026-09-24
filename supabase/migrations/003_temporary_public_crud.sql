-- Temporary local-development mode.
--
-- WARNING: Anyone with the project's public URL and anon key can read, edit,
-- and delete every row in public.job_leads while these policies are active.
-- Do not use this migration for a publicly deployed application.

drop policy if exists "Anonymous users can view all job leads"
  on public.job_leads;
create policy "Anonymous users can view all job leads"
on public.job_leads
for select
to anon
using (true);

drop policy if exists "Anonymous users can update all job leads"
  on public.job_leads;
create policy "Anonymous users can update all job leads"
on public.job_leads
for update
to anon
using (true)
with check (true);

drop policy if exists "Anonymous users can delete all job leads"
  on public.job_leads;
create policy "Anonymous users can delete all job leads"
on public.job_leads
for delete
to anon
using (true);

revoke all on table public.job_leads from anon;
grant select, delete on table public.job_leads to anon;
grant update (title, description, url) on table public.job_leads to anon;
