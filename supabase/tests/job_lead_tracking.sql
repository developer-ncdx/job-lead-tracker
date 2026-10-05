-- Run with: supabase db query --linked --project-ref <project-ref> --file <this-file>
-- All test data and writes are rolled back; existing leads are never modified.
begin;

insert into public.job_leads (user_id, title, url, source, source_job_id)
values (null, 'Tracking regression test', 'https://example.com/jobs/tracking-test',
  'tracking-regression-test', txid_current()::text);

do $$
begin
  if not exists (
    select 1 from public.job_leads
    where source = 'tracking-regression-test' and source_job_id = txid_current()::text
      and not is_read and applied_at is null
  ) then
    raise exception 'New leads must default to unread and not applied';
  end if;
end;
$$;

-- Exercise the same role and columns used by the no-sign-in UI.
set local role anon;
update public.job_leads
set is_read = true, applied_at = '2026-10-05T00:00:00Z'
where source = 'tracking-regression-test' and source_job_id = txid_current()::text;
reset role;

-- A source refresh must preserve the tracking fields it does not supply.
insert into public.job_leads (user_id, title, url, source, source_job_id)
values (null, 'Refreshed test title', 'https://example.com/jobs/tracking-test',
  'tracking-regression-test', txid_current()::text)
on conflict (user_id, source, source_job_id) do update set title = excluded.title;

do $$
begin
  if not exists (
    select 1 from public.job_leads
    where source = 'tracking-regression-test' and source_job_id = txid_current()::text
      and is_read and applied_at = '2026-10-05T00:00:00Z'
      and title = 'Refreshed test title'
  ) then
    raise exception 'Status writes must succeed and source refreshes must preserve them';
  end if;
end;
$$;

set local role anon;
update public.job_leads set applied_at = null
where source = 'tracking-regression-test' and source_job_id = txid_current()::text;
reset role;

do $$
begin
  if not exists (
    select 1 from public.job_leads
    where source = 'tracking-regression-test' and source_job_id = txid_current()::text
      and is_read and applied_at is null
  ) then
    raise exception 'Undo must remove the application without resetting read state';
  end if;
end;
$$;

set local role anon;
update public.job_leads set is_read = false
where source = 'tracking-regression-test' and source_job_id = txid_current()::text;
reset role;

do $$
begin
  if not exists (
    select 1 from public.job_leads
    where source = 'tracking-regression-test' and source_job_id = txid_current()::text
      and not is_read and applied_at is null
  ) then
    raise exception 'Mark unread must persist';
  end if;
end;
$$;

rollback;
