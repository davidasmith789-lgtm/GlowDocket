begin;

alter table public.google_sync_issues
  add column if not exists category text,
  add column if not exists direction text,
  add column if not exists item_title text,
  add column if not exists safe_explanation text,
  add column if not exists recommended_action text,
  add column if not exists diagnostic_ref text,
  add column if not exists dedupe_key text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists last_occurred_at timestamptz,
  add column if not exists resolution_reason text,
  add column if not exists updated_at timestamptz not null default now();

update public.google_sync_issues set
  category = coalesce(category, case kind when 'conflict' then 'conflict' when 'mapping_recovery' then 'mapping_recovery' else 'temporary_provider_failure' end),
  direction = coalesce(direction, case kind when 'mapping_recovery' then 'google_to_glowdocket' when 'conflict' then 'bidirectional' else 'glowdocket_to_google' end),
  item_title = coalesce(nullif(item_title, ''), case when glowdocket_type is not null then initcap(replace(glowdocket_type, '_', ' ')) else 'Google Calendar connection' end),
  safe_explanation = coalesce(nullif(safe_explanation, ''), case kind when 'conflict' then 'This item changed in both GlowDocket and Google Calendar.' when 'mapping_recovery' then 'GlowDocket could not safely match this Google event to its original item.' else 'Google Calendar could not complete a synchronization step.' end),
  recommended_action = coalesce(nullif(recommended_action, ''), case kind when 'conflict' then 'Review the item and choose which version to keep.' when 'mapping_recovery' then 'Retry synchronization. GlowDocket will restore the connection when it can verify the item.' else 'Retry synchronization. If it continues, reconnect Google Calendar.' end),
  diagnostic_ref = coalesce(diagnostic_ref, 'GC-' || upper(substr(encode(digest(id::text, 'sha256'), 'hex'), 1, 4))),
  last_occurred_at = coalesce(last_occurred_at, created_at),
  updated_at = coalesce(updated_at, created_at)
where category is null or direction is null or item_title is null or safe_explanation is null
  or recommended_action is null or diagnostic_ref is null or last_occurred_at is null;

create unique index if not exists google_sync_issues_dedupe_idx
  on public.google_sync_issues(user_id, dedupe_key)
  where dedupe_key is not null;
create index if not exists google_sync_issues_history_idx
  on public.google_sync_issues(user_id, resolved_at, last_occurred_at desc);
create index if not exists google_sync_issues_diagnostic_ref_idx
  on public.google_sync_issues(diagnostic_ref)
  where diagnostic_ref is not null;

commit;
