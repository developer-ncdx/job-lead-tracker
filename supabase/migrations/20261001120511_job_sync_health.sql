create table public.job_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  trigger text not null check (trigger in ('scheduled_cron', 'manual_cron', 'local_sync')),
  status text not null default 'running' check (status in ('running', 'success', 'warning', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched integer not null default 0 check (fetched >= 0),
  matching integer not null default 0 check (matching >= 0),
  unique_jobs integer not null default 0 check (unique_jobs >= 0),
  written integer not null default 0 check (written >= 0),
  existing_jobs integer not null default 0 check (existing_jobs >= 0),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  error_message text
);

create index job_sync_runs_owner_started_idx on public.job_sync_runs (user_id, started_at desc);
create index job_sync_runs_owner_trigger_started_idx on public.job_sync_runs (user_id, trigger, started_at desc);
create index job_sync_runs_owner_success_finished_idx on public.job_sync_runs (user_id, finished_at desc)
  where status in ('success', 'warning');

alter table public.job_sync_runs enable row level security;
revoke all on public.job_sync_runs from anon, authenticated;
grant select on public.job_sync_runs to anon, authenticated;
grant select, insert, update on public.job_sync_runs to service_role;

create policy "Read public sync runs" on public.job_sync_runs for select
  to anon, authenticated using (user_id is null);
create policy "Read own sync runs" on public.job_sync_runs for select
  to authenticated using ((select auth.uid()) = user_id);

comment on table public.job_sync_runs is
  'Server-written run outcomes. Browser clients can only read visible history; no job-card metadata is changed.';
