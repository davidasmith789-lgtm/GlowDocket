-- Expose privacy-safe aggregate counters used by local Flashcard badge mastery.
create or replace function public.flashcard_reward_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'total_xp', coalesce((select sum(xp) from public.flashcard_xp_events where user_id = auth.uid()), 0),
    'today_xp', coalesce((select sum(xp) from public.flashcard_xp_events where user_id = auth.uid() and event_day = current_date), 0),
    'daily_cap', 100,
    'badges', coalesce((select jsonb_agg(badge_id) from public.flashcard_badge_unlocks where user_id = auth.uid()), '[]'::jsonb),
    'deck_count', (select count(*) from public.flashcard_decks where owner_id = auth.uid()),
    'session_count', (select count(*) from public.flashcard_study_sessions where user_id = auth.uid() and session_completed),
    'unique_cards', (select count(distinct card_id) from public.flashcard_xp_events where user_id = auth.uid() and card_id is not null),
    'study_days', (select count(distinct event_day) from public.flashcard_xp_events where user_id = auth.uid() and card_id is not null),
    'recent_study_days', (select count(distinct event_day) from public.flashcard_xp_events where user_id = auth.uid() and card_id is not null and event_day >= current_date - interval '7 days'),
    'before_target_sessions', (select count(*) from public.flashcard_xp_events where user_id = auth.uid() and event_type = 'before_target'),
    'shared_deck_count', (select count(*) from public.flashcard_decks where owner_id = auth.uid() and visibility = 'shared' and published_at is not null),
    'helpful_count', (select count(*) from public.flashcard_deck_ratings r join public.flashcard_decks d on d.id = r.deck_id where d.owner_id = auth.uid() and r.rating = 'Helpful'),
    'community_deck_count', (select count(distinct l.deck_id) from public.community_post_decks l join public.flashcard_decks d on d.id = l.deck_id where d.owner_id = auth.uid())
  );
$$;

