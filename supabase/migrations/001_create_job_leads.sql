create extension if not exists pgcrypto;

create table if not exists public.job_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  url text not null check (url ~* '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.job_leads is
  'Job leads created by external sources and managed through the tracker UI.';

create index if not exists job_leads_user_created_at_idx
  on public.job_leads (user_id, created_at desc);

create or replace function public.set_job_leads_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_job_leads_updated_at on public.job_leads;
create trigger set_job_leads_updated_at
before update on public.job_leads
for each row execute function public.set_job_leads_updated_at();

alter table public.job_leads enable row level security;
alter table public.job_leads replica identity full;

drop policy if exists "Users can view their own job leads" on public.job_leads;
create policy "Users can view their own job leads"
on public.job_leads
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own job leads" on public.job_leads;
create policy "Users can update their own job leads"
on public.job_leads
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own job leads" on public.job_leads;
create policy "Users can delete their own job leads"
on public.job_leads
for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.job_leads from anon, authenticated;
grant select, delete on table public.job_leads to authenticated;
grant update (title, description, url) on table public.job_leads to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
      and not puballtables
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'job_leads'
  ) then
    alter publication supabase_realtime add table public.job_leads;
  end if;
end
$$;
