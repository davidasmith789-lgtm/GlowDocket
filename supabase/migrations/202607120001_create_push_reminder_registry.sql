create extension if not exists pgcrypto;

create table if not exists public.push_profile_installations (
  profile_installation_id text primary key check (profile_installation_id ~ '^[A-Za-z0-9_-]{24,120}$'),
  onesignal_subscription_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_reminders (
  id uuid primary key default gen_random_uuid(),
  profile_installation_id text not null references public.push_profile_installations(profile_installation_id) on delete cascade,
  task_id text not null,
  occurrence_key text not null,
  onesignal_subscription_id text not null,
  onesignal_message_id text,
  assignment_title text not null check (char_length(assignment_title) between 1 and 160),
  course text check (course is null or char_length(course) <= 100),
  deadline timestamptz not null,
  reminder_send_time timestamptz not null,
  timezone text not null,
  lead_time_minutes integer not null check (lead_time_minutes between 1 and 43200),
  local_revision text not null,
  scheduling_status text not null check (scheduling_status in ('pending_horizon','scheduled','scheduling_failed','pending_cleanup')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_installation_id, occurrence_key)
);

create index if not exists push_reminders_profile_idx on public.push_reminders(profile_installation_id);
create index if not exists push_reminders_horizon_idx on public.push_reminders(scheduling_status, reminder_send_time);
create index if not exists push_reminders_cleanup_idx on public.push_reminders(scheduling_status, updated_at) where scheduling_status = 'pending_cleanup';

alter table public.push_profile_installations enable row level security;
alter table public.push_reminders enable row level security;
revoke all on public.push_profile_installations from anon, authenticated;
revoke all on public.push_reminders from anon, authenticated;

comment on table public.push_reminders is 'Minimal server-only registry for TaskCabinet web-push schedules; never store notes, passwords, usernames, or full assignments.';
