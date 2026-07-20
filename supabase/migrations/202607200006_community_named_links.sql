alter table public.community_posts
  add column if not exists links jsonb not null default '[]'::jsonb;

create or replace function public.community_links_valid(value jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(value) <> 'array' then false else
    jsonb_array_length(value) <= 5
      and not exists (
        select 1 from jsonb_array_elements(value) item
        where jsonb_typeof(item) <> 'object'
          or length(btrim(coalesce(item->>'name', ''))) not between 1 and 80
          or length(coalesce(item->>'url', '')) not between 8 and 2000
          or coalesce(item->>'url', '') !~* '^https?://'
      )
  end;
$$;

alter table public.community_posts
  drop constraint if exists community_links_valid;

alter table public.community_posts
  add constraint community_links_valid check (
    public.community_links_valid(links)
  );

grant update (links) on public.community_posts to authenticated;

drop function if exists public.create_community_post(text, text, text, text, text[]);
create function public.create_community_post(
  new_course_name text,
  new_post_type text,
  new_title text,
  new_body text,
  new_topic_tags text[] default '{}',
  new_links jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 20260720));
  if (select count(*) from public.community_posts where author_id = auth.uid() and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Daily post limit reached: maximum three posts in any rolling 24 hours';
  end if;
  insert into public.community_posts (author_id, course_name, post_type, title, body, topic_tags, links)
  values (auth.uid(), new_course_name, new_post_type, new_title, new_body, new_topic_tags, new_links)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_community_post(text, text, text, text, text[], jsonb) from public;
grant execute on function public.create_community_post(text, text, text, text, text[], jsonb) to authenticated;

drop function if exists public.community_search_posts(text, text, text, int, int, boolean);
create function public.community_search_posts(
  search_text text default '', filter_post_type text default null,
  sort_by text default 'helpful', page_number int default 0,
  page_size int default 20, saved_only boolean default false
)
returns table (
  id uuid, author_id uuid, course_name text, post_type text, title text, body text,
  topic_tags text[], links jsonb, status text, created_at timestamptz, updated_at timestamptz,
  helpful_count bigint, not_helpful_count bigint, save_count bigint,
  current_vote text, is_saved boolean
)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.id, p.author_id, p.course_name, p.post_type, p.title, p.body,
    p.topic_tags, p.links, p.status, p.created_at, p.updated_at,
    count(distinct v.user_id) filter (where v.vote = 'Helpful'),
    count(distinct v.user_id) filter (where v.vote = 'Not helpful'), count(distinct s.user_id),
    max(v.vote) filter (where v.user_id = auth.uid()), coalesce(bool_or(s.user_id = auth.uid()), false)
  from public.community_posts p
  left join public.community_post_votes v on v.post_id = p.id
  left join public.community_post_saves s on s.post_id = p.id
  where auth.uid() is not null
    and (p.status = 'active' or p.author_id = auth.uid() or public.is_community_moderator(auth.uid()))
    and (filter_post_type is null or p.post_type = filter_post_type)
    and (not saved_only or exists (select 1 from public.community_post_saves mine where mine.post_id = p.id and mine.user_id = auth.uid()))
    and (coalesce(btrim(search_text), '') = '' or p.search_document @@ websearch_to_tsquery('english'::regconfig, search_text)
      or p.normalized_course_name like '%' || lower(search_text) || '%'
      or exists (select 1 from jsonb_array_elements(p.links) link where lower(link->>'name') like '%' || lower(search_text) || '%'))
  group by p.id
  order by case when sort_by = 'helpful' then count(distinct v.user_id) filter (where v.vote = 'Helpful') end desc,
    case when sort_by = 'updated' then p.updated_at end desc, p.created_at desc, p.id
  limit least(greatest(page_size, 1), 50)
  offset greatest(page_number, 0) * least(greatest(page_size, 1), 50);
$$;
revoke all on function public.community_search_posts(text, text, text, int, int, boolean) from public;
grant execute on function public.community_search_posts(text, text, text, int, int, boolean) to authenticated;
