alter table public.job_leads
  add column if not exists source_timestamp_label text;

comment on column public.job_leads.source_timestamp_label is
  'Provider-supplied posting-time text when no exact source timestamp is available.';

-- LinkedIn timestamps imported before this migration were calculated from
-- relative labels such as "2 days ago". They are estimates, not provider
-- timestamps, so remove them rather than presenting them as exact values.
update public.job_leads
set
  source_timestamp_at = null,
  source_timestamp_kind = null
where source = 'linkedin-email';
