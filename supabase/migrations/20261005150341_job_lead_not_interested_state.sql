-- Sync upserts omit this user-managed status, preserving dismissals.
alter table public.job_leads
  add column if not exists not_interested_at timestamptz;

comment on column public.job_leads.not_interested_at is
  'When the user dismissed the job, or null when interested. Mutually exclusive with applied_at.';

alter table public.job_leads
  add constraint job_leads_application_interest_exclusive
    check (applied_at is null or not_interested_at is null);

-- Keep the existing ownership policies and read/application permissions.
grant update (not_interested_at) on table public.job_leads to anon, authenticated;
