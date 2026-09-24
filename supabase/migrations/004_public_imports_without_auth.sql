-- Public local mode has no authenticated owner. Imported rows therefore use
-- a null owner while preserving the auth.users foreign key for future use.

alter table public.job_leads
  alter column user_id drop not null;

alter table public.job_leads
  drop constraint if exists job_leads_owner_source_job_key;

alter table public.job_leads
  add constraint job_leads_owner_source_job_key
  unique nulls not distinct (user_id, source, source_job_id);

comment on column public.job_leads.user_id is
  'Authenticated owner UUID, or null for temporary public-mode imports.';
