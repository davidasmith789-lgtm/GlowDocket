create table if not exists public.taskcabinet_cloud_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  schema_version integer not null,
  revision bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists taskcabinet_cloud_history_user_created_idx
  on public.taskcabinet_cloud_history(user_id, created_at desc);

alter table public.taskcabinet_cloud_history enable row level security;
create policy "Users can read their own TaskCabinet history" on public.taskcabinet_cloud_history
  for select to authenticated using (auth.uid() = user_id);
revoke all on public.taskcabinet_cloud_history from anon;
grant select on public.taskcabinet_cloud_history to authenticated;

create or replace function public.capture_taskcabinet_cloud_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.state is distinct from new.state then
    insert into public.taskcabinet_cloud_history(user_id, state, schema_version, revision)
      values (old.user_id, old.state, old.schema_version, old.revision);
    delete from public.taskcabinet_cloud_history
      where user_id = old.user_id and id not in (
        select id from public.taskcabinet_cloud_history where user_id = old.user_id order by created_at desc, id desc limit 20
      );
  end if;
  return new;
end;
$$;

drop trigger if exists taskcabinet_cloud_state_history on public.taskcabinet_cloud_state;
create trigger taskcabinet_cloud_state_history before update on public.taskcabinet_cloud_state
  for each row execute function public.capture_taskcabinet_cloud_history();

comment on table public.taskcabinet_cloud_history is 'The 20 most recent prior TaskCabinet cloud snapshots per Auth user.';
