-- Run in the SQL Editor after applying the Crew Club migration.
-- Test inserts are rolled back and do not modify existing crawler state.
begin;
do $$
declare
  test_user uuid := gen_random_uuid();
  crawl_source text;
begin
  -- A real owner allows the tests to leave existing null-owner rows untouched.
  insert into auth.users (id) values (test_user);
  foreach crawl_source in array array['onlinejobsph', 'smileandhire', 'crewclub'] loop
    insert into public.job_crawl_states (user_id, source)
    values (test_user, crawl_source);
  end loop;
  begin
    insert into public.job_crawl_states (user_id, source)
    values (test_user, 'unsupported-crawler');
    raise exception 'Unsupported crawler sources must be rejected';
  exception when check_violation then
    null;
  end;
  if not (select relrowsecurity from pg_class where oid = 'public.job_crawl_states'::regclass) then
    raise exception 'Crawler state must retain RLS';
  end if;
  if has_table_privilege('anon', 'public.job_crawl_states', 'INSERT')
    or has_table_privilege('authenticated', 'public.job_crawl_states', 'INSERT') then
    raise exception 'Browser roles must not write crawler state';
  end if;
end;
$$;
rollback;
