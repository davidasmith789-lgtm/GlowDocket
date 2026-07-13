alter table public.push_reminders
  add column if not exists preferred_name text
  check (preferred_name is null or char_length(preferred_name) <= 60);

comment on column public.push_reminders.preferred_name is
  'Optional user-chosen greeting name used only to personalize server-generated notification wording; never used as an external identity.';
