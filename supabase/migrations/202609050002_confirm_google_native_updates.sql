begin;

create or replace function public.confirm_google_native_update(
  p_user_id uuid,
  p_job_id uuid,
  p_mapping_id uuid,
  p_pending_google_hash text,
  p_glowdocket_snapshot jsonb,
  p_glowdocket_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  affected integer;
  owned_job uuid;
  owned_lock_until timestamptz;
begin
  select sync_job_id, sync_lock_until
    into owned_job, owned_lock_until
    from public.google_calendar_connections
   where user_id = p_user_id
   for update;

  if not found
     or p_job_id is null
     or owned_job is distinct from p_job_id
     or owned_lock_until is null
     or owned_lock_until <= clock_timestamp() then
    return false;
  end if;

  update public.google_event_mappings
     set google_etag = pending_google_etag,
         google_updated_at = pending_google_updated_at,
         last_google_snapshot = pending_google_snapshot,
         last_google_hash = pending_google_hash,
         last_glowdocket_snapshot = p_glowdocket_snapshot,
         last_glowdocket_hash = p_glowdocket_hash,
         pending_google_snapshot = null,
         pending_google_hash = null,
         pending_google_etag = null,
         pending_google_updated_at = null,
         sync_version = sync_version + 1,
         updated_at = now()
   where id = p_mapping_id
     and user_id = p_user_id
     and state = 'active'
     and pending_google_hash = p_pending_google_hash
     and pending_google_snapshot is not null;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.continue_google_sync_job(
  p_user_id uuid,
  p_job_id uuid,
  p_lock_until timestamptz,
  p_cursor integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  owned_job uuid;
  owned_lock_until timestamptz;
  owned_cursor integer;
  checked_at timestamptz;
begin
  select sync_job_id, sync_lock_until, sync_cursor
    into owned_job, owned_lock_until, owned_cursor
    from public.google_calendar_connections
   where user_id = p_user_id
   for update;

  checked_at := clock_timestamp();
  if not found
     or p_job_id is null
     or owned_job is distinct from p_job_id
     or owned_lock_until is null
     or owned_lock_until <= checked_at
     or p_lock_until <= checked_at
     or p_lock_until > checked_at + interval '2 minutes' then
    return null;
  end if;

  update public.google_calendar_connections
     set sync_cursor = coalesce(p_cursor, sync_cursor),
         sync_lock_until = p_lock_until
   where user_id = p_user_id
     and sync_job_id = p_job_id;

  return jsonb_build_object('jobId', owned_job, 'cursor', coalesce(p_cursor, owned_cursor, 0));
end;
$$;

revoke all on function public.confirm_google_native_update(uuid, uuid, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.confirm_google_native_update(uuid, uuid, uuid, text, jsonb, text) to service_role;
revoke all on function public.continue_google_sync_job(uuid, uuid, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.continue_google_sync_job(uuid, uuid, timestamptz, integer) to service_role;

commit;
