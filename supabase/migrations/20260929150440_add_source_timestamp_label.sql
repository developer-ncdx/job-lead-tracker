alter table public.job_leads
  add column if not exists source_timestamp_label text;

comment on column public.job_leads.source_timestamp_label is
  'Provider-supplied posting-time text when no exact source timestamp is available.';

-- Existing exact provider timestamps must remain intact. Legacy estimated
-- LinkedIn timestamps were cleared before this migration was prepared.
