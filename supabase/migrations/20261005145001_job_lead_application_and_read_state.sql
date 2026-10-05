-- User-managed tracking fields. Sync upserts intentionally omit these columns.
alter table public.job_leads
  add column if not exists is_read boolean not null default false,
  add column if not exists applied_at timestamptz;

comment on column public.job_leads.is_read is
  'Whether the posting has been read; shared in the existing no-sign-in mode.';
comment on column public.job_leads.applied_at is
  'When the user marked the job as applied, or null when not applied.';

-- Preserve the existing SELECT/UPDATE policies and ownership rules.
grant update (is_read, applied_at) on table public.job_leads to anon, authenticated;
