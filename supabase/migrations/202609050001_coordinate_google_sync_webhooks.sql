begin;

alter table public.google_selected_calendars
  add column if not exists webhook_dirty boolean not null default false,
  add column if not exists webhook_dirty_at timestamptz;

alter table public.google_event_mappings
  drop constraint if exists google_event_mappings_state_check;

alter table public.google_event_mappings
  add constraint google_event_mappings_state_check
  check (state in ('creating','active','unlinked_by_user','google_deleted','recovery_required','error'));

create index if not exists google_selected_calendars_webhook_dirty_idx
  on public.google_selected_calendars(user_id, calendar_id)
  where webhook_dirty;

create or replace function public.consume_google_webhook_dirty(p_user_id uuid)
returns table (calendar_id text)
language sql
security definer
set search_path = public
as $$
  update public.google_selected_calendars
     set webhook_dirty = false,
         webhook_dirty_at = null,
         last_sync_job_id = null,
         updated_at = now()
   where user_id = p_user_id
     and selected_for_import = true
     and webhook_dirty = true
  returning google_selected_calendars.calendar_id;
$$;

create or replace function public.mark_google_webhook_dirty(p_user_id uuid, p_calendar_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  perform 1
    from public.google_calendar_connections
   where user_id = p_user_id
   for update;

  if not found then
    return false;
  end if;

  update public.google_selected_calendars
     set webhook_dirty = true,
         webhook_dirty_at = now(),
         updated_at = now()
   where user_id = p_user_id
     and calendar_id = p_calendar_id
     and selected_for_import = true;

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function public.finalize_google_sync_job(p_user_id uuid, p_job_id uuid)
returns table (result text, calendar_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_job uuid;
  consumed_count integer;
begin
  select sync_job_id
    into owned_job
    from public.google_calendar_connections
   where user_id = p_user_id
   for update;

  if p_job_id is null or owned_job is distinct from p_job_id then
    return query select 'not_owner'::text, null::text;
    return;
  end if;

  return query
    with consumed as (
      update public.google_selected_calendars
         set webhook_dirty = false,
             webhook_dirty_at = null,
             last_sync_job_id = null,
             updated_at = now()
       where user_id = p_user_id
         and selected_for_import = true
         and webhook_dirty = true
      returning google_selected_calendars.calendar_id
    )
    select 'continue'::text, consumed.calendar_id
      from consumed;

  get diagnostics consumed_count = row_count;
  if consumed_count > 0 then
    return;
  end if;

  update public.google_calendar_connections
     set sync_job_id = null,
         sync_cursor = 0,
         sync_lock_until = null,
         sync_started_at = null
   where user_id = p_user_id
     and sync_job_id = p_job_id;

  return query select 'complete'::text, null::text;
end;
$$;

revoke all on function public.consume_google_webhook_dirty(uuid) from public, anon, authenticated;
grant execute on function public.consume_google_webhook_dirty(uuid) to service_role;
revoke all on function public.mark_google_webhook_dirty(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_google_webhook_dirty(uuid, text) to service_role;
revoke all on function public.finalize_google_sync_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_google_sync_job(uuid, uuid) to service_role;

commit;
