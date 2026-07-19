create extension if not exists pgcrypto;

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('solo')),
  score integer not null check (score >= 0),
  correct_count integer not null check (correct_count >= 0),
  total_rounds integer not null check (total_rounds > 0),
  accuracy numeric(6, 5) not null check (accuracy >= 0 and accuracy <= 1),
  best_streak integer not null check (best_streak >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint game_sessions_correct_count_check
    check (correct_count <= total_rounds),
  constraint game_sessions_best_streak_check
    check (best_streak <= total_rounds)
);

create index if not exists game_sessions_user_created_idx
  on public.game_sessions (user_id, created_at desc);

create index if not exists game_sessions_leaderboard_idx
  on public.game_sessions (score desc, accuracy desc, created_at asc);

alter table public.game_sessions enable row level security;

revoke all on table public.game_sessions from anon, authenticated;

grant select, insert, update, delete on table public.game_sessions to service_role;

create or replace view public.insights_game_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  mode,
  count(*)::integer as session_count,
  round(avg(score)::numeric, 2) as average_score,
  round(avg(accuracy)::numeric, 5) as average_accuracy,
  max(score)::integer as highest_score
from public.game_sessions
group by 1, 2;

revoke all on table public.insights_game_summary from anon, authenticated;
grant select on table public.insights_game_summary to service_role;
