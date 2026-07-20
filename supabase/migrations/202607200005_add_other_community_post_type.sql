alter table public.community_posts
  drop constraint if exists community_post_type_allowed;

alter table public.community_posts
  add constraint community_post_type_allowed check (
    post_type in ('Course Advice', 'Study Guide', 'Concept Explanation', 'Class Tips', 'Other')
  );
