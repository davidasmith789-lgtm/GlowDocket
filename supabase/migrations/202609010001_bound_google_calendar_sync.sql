begin;

alter table public.google_selected_calendars
  add column if not exists pending_page_token text,
  add column if not exists pending_sync_mode text check (pending_sync_mode in ('full','incremental')),
  add column if not exists pending_started_at timestamptz,
  add column if not exists last_sync_job_id uuid;

alter table public.google_calendar_connections
  add column if not exists sync_job_id uuid,
  add column if not exists sync_cursor integer not null default 0,
  add column if not exists sync_lock_until timestamptz,
  add column if not exists sync_started_at timestamptz;

alter table public.google_event_mappings
  add column if not exists pending_google_snapshot jsonb,
  add column if not exists pending_google_hash text,
  add column if not exists pending_google_etag text,
  add column if not exists pending_google_updated_at timestamptz;

create index if not exists google_calendar_sync_lock_idx
  on public.google_calendar_connections(sync_lock_until)
  where sync_job_id is not null;

commit;
