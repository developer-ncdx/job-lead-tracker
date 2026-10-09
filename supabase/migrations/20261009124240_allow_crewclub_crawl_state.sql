-- Crew Club uses the same private lease/cooldown state as the existing crawlers.
-- Keep browser grants and RLS unchanged.
begin;
alter table public.job_crawl_states
  drop constraint job_crawl_states_source_check;
alter table public.job_crawl_states
  add constraint job_crawl_states_source_check
  check (source in ('onlinejobsph', 'smileandhire', 'crewclub'));
commit;
