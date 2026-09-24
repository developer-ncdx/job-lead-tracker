alter table public.job_leads
  add column if not exists source text,
  add column if not exists source_job_id text,
  add column if not exists company text,
  add column if not exists location text,
  add column if not exists is_remote boolean,
  add column if not exists source_timestamp_at timestamptz,
  add column if not exists source_timestamp_kind text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz;

update public.job_leads
set
  first_seen_at = coalesce(first_seen_at, created_at),
  last_seen_at = coalesce(last_seen_at, created_at)
where first_seen_at is null
   or last_seen_at is null;

alter table public.job_leads
  alter column first_seen_at set default now(),
  alter column first_seen_at set not null,
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_leads_source_timestamp_kind_check'
      and conrelid = 'public.job_leads'::regclass
  ) then
    alter table public.job_leads
      add constraint job_leads_source_timestamp_kind_check
      check (
        source_timestamp_kind is null
        or source_timestamp_kind in ('published', 'created', 'updated')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_leads_owner_source_job_key'
      and conrelid = 'public.job_leads'::regclass
  ) then
    alter table public.job_leads
      add constraint job_leads_owner_source_job_key
      unique (user_id, source, source_job_id);
  end if;
end
$$;

create index if not exists job_leads_user_source_timestamp_idx
  on public.job_leads (
    user_id,
    source_timestamp_at desc nulls last,
    created_at desc
  );

comment on column public.job_leads.source is
  'Normalized upstream source name for the imported job.';
comment on column public.job_leads.source_job_id is
  'Stable identifier assigned by the upstream job source.';
comment on column public.job_leads.source_timestamp_at is
  'Timestamp supplied by the upstream source.';
comment on column public.job_leads.source_timestamp_kind is
  'Meaning of source_timestamp_at: published, created, or updated.';
comment on column public.job_leads.first_seen_at is
  'First time this tracker observed the source job.';
comment on column public.job_leads.last_seen_at is
  'Most recent successful observation of the source job.';
