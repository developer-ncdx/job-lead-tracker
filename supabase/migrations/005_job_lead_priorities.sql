alter table public.job_leads
  add column if not exists is_priority boolean not null default false;

comment on column public.job_leads.is_priority is
  'Whether the lead is saved in the user priority list.';

create index if not exists job_leads_priority_idx
  on public.job_leads (user_id, source_timestamp_at desc)
  where is_priority;

drop policy if exists "Users can delete their own job leads"
  on public.job_leads;
drop policy if exists "Anonymous users can delete all job leads"
  on public.job_leads;

revoke delete on table public.job_leads from anon, authenticated;
grant update (is_priority) on table public.job_leads to anon, authenticated;
