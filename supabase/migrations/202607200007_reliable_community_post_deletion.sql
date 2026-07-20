create or replace function public.delete_community_post(target_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_author_id uuid;
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select author_id into target_author_id
  from public.community_posts
  where id = target_post_id;

  if target_author_id is null then
    raise exception 'Post not found';
  end if;

  if target_author_id <> auth.uid()
    and not public.is_community_moderator(auth.uid()) then
    raise exception 'Not authorized to delete this post';
  end if;

  delete from public.community_posts where id = target_post_id;
  get diagnostics deleted_count = row_count;

  if deleted_count <> 1 then
    raise exception 'Post deletion did not complete';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_community_post(uuid) from public;
grant execute on function public.delete_community_post(uuid) to authenticated;
