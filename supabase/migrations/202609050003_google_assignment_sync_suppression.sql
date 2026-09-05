begin;

alter table public.google_event_mappings
  add column if not exists suppression_reason text;

comment on column public.google_event_mappings.suppression_reason is
  'Automatic native lifecycle suppression: completed, archive, trash, or deleted. NULL for active and intentionally unlinked mappings.';

commit;
