-- Server-only crawler cache, overlap leases, and provider cooldowns.
create table public.job_crawl_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source text not null check (source in ('onlinejobsph', 'smileandhire')),
  cache jsonb not null default '{}'::jsonb,
  lease_token uuid,
  lease_until timestamptz,
  cooldown_until timestamptz,
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, source)
);

alter table public.job_crawl_states enable row level security;
revoke all on table public.job_crawl_states from public, anon, authenticated;
grant select, insert, update, delete on table public.job_crawl_states to service_role;

comment on table public.job_crawl_states is
  'Private server state for hourly public job crawls. Browser roles have no access.';
