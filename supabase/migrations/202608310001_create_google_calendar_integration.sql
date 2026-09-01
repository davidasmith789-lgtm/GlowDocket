begin;

create extension if not exists pgcrypto;

create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text not null,
  google_email text not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected','needs_reauthorization','error','disconnected')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, google_sub)
);

create table if not exists public.google_calendar_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  destination_calendar_id text,
  destination_kind text not null default 'dedicated' check (destination_kind in ('dedicated','existing')),
  dedicated_calendar_id text,
  sync_assignments boolean not null default true,
  sync_activities boolean not null default true,
  sync_classes boolean not null default true,
  sync_checklists boolean not null default false,
  include_notes boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.google_selected_calendars (
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  summary text not null default '',
  access_role text,
  selected_for_import boolean not null default false,
  sync_token text,
  full_sync_required boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, calendar_id)
);

create table if not exists public.google_imported_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  event_id text not null,
  recurring_event_id text,
  original_start_time jsonb,
  event_status text,
  normalized_event jsonb not null,
  etag text,
  google_updated_at timestamptz,
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, calendar_id, event_id)
);

create table if not exists public.google_event_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  glowdocket_type text not null,
  glowdocket_id text not null,
  google_calendar_id text not null,
  google_event_id text not null,
  state text not null default 'active' check (state in ('active','unlinked_by_user','google_deleted','recovery_required','error')),
  google_etag text,
  google_updated_at timestamptz,
  glowdocket_updated_at timestamptz,
  last_google_snapshot jsonb,
  last_google_hash text,
  last_glowdocket_snapshot jsonb,
  last_glowdocket_hash text,
  sync_version bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, glowdocket_type, glowdocket_id),
  unique (user_id, google_calendar_id, google_event_id)
);

create table if not exists public.google_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  authorization_kind text not null check (authorization_kind in ('initial','existing_calendar_write')),
  return_to text not null default '/',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.google_webhook_channels (
  channel_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id text not null,
  token_hash text not null,
  resource_id text,
  expiration timestamptz,
  latest_message_number bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_sync_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('conflict','mapping_recovery','sync_error')),
  glowdocket_type text,
  glowdocket_id text,
  google_calendar_id text,
  google_event_id text,
  details jsonb not null default '{}',
  recoverable boolean not null default true,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists google_imported_events_visible_idx on public.google_imported_events(user_id, hidden, google_updated_at);
create index if not exists google_sync_issues_open_idx on public.google_sync_issues(user_id, created_at desc) where resolved_at is null;
create index if not exists google_webhook_expiry_idx on public.google_webhook_channels(expiration) where active;

alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_preferences enable row level security;
alter table public.google_selected_calendars enable row level security;
alter table public.google_imported_events enable row level security;
alter table public.google_event_mappings enable row level security;
alter table public.google_oauth_states enable row level security;
alter table public.google_webhook_channels enable row level security;
alter table public.google_sync_issues enable row level security;

-- Integration rows are intentionally server-only. The service-role API verifies
-- the Supabase session and scopes every query to that authenticated user.
revoke all on public.google_calendar_connections, public.google_calendar_preferences,
  public.google_selected_calendars, public.google_imported_events,
  public.google_event_mappings, public.google_oauth_states,
  public.google_webhook_channels, public.google_sync_issues from anon, authenticated;

commit;
