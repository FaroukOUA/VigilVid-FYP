create extension if not exists pgcrypto;

create table if not exists public.detection_history (
  id uuid primary key default gen_random_uuid(),
  detection_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  source_type text not null check (source_type in ('url', 'upload', 'share')),
  label text not null check (label in ('real', 'partially_real', 'partially_fake', 'fake')),
  ai_probability numeric(6, 5) not null check (ai_probability >= 0 and ai_probability <= 1),
  confidence_percent numeric(5, 2) not null check (confidence_percent >= 0 and confidence_percent <= 100),
  processing_time_sec numeric(10, 3),
  video_duration_sec numeric(10, 3),
  retained_for_research boolean not null default false,
  save_to_history boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint detection_history_persistence_reason_check
    check (retained_for_research or save_to_history)
);

create table if not exists public.detection_windows (
  id uuid primary key default gen_random_uuid(),
  detection_history_id uuid not null references public.detection_history(id) on delete cascade,
  window_index integer not null check (window_index >= 0),
  start_sec numeric(10, 3) not null check (start_sec >= 0),
  end_sec numeric(10, 3) not null check (end_sec >= start_sec),
  fake_probability numeric(6, 5) not null check (fake_probability >= 0 and fake_probability <= 1),
  created_at timestamptz not null default now(),
  unique (detection_history_id, window_index)
);

create table if not exists public.detection_feedback (
  id uuid primary key default gen_random_uuid(),
  detection_id text not null,
  detection_history_id uuid references public.detection_history(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  feedback_type text not null check (
    feedback_type in ('false_positive', 'false_negative', 'unclear_result', 'other')
  ),
  comment text not null default '',
  allow_research_use boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists detection_history_user_created_idx
  on public.detection_history (user_id, created_at desc);

create index if not exists detection_history_research_created_idx
  on public.detection_history (retained_for_research, created_at desc);

create index if not exists detection_windows_history_idx
  on public.detection_windows (detection_history_id, window_index);

create index if not exists detection_feedback_detection_idx
  on public.detection_feedback (detection_id, created_at desc);

alter table public.detection_history enable row level security;
alter table public.detection_windows enable row level security;
alter table public.detection_feedback enable row level security;

revoke all on table public.detection_history from anon, authenticated;
revoke all on table public.detection_windows from anon, authenticated;
revoke all on table public.detection_feedback from anon, authenticated;

grant select, insert, update, delete on table public.detection_history to service_role;
grant select, insert, update, delete on table public.detection_windows to service_role;
grant select, insert, update, delete on table public.detection_feedback to service_role;

create or replace view public.insights_detection_summary
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as day,
  source_type,
  label,
  count(*)::integer as detection_count,
  count(*) filter (where retained_for_research)::integer as research_contribution_count,
  round(avg(ai_probability)::numeric, 5) as average_ai_probability
from public.detection_history
where retained_for_research
group by 1, 2, 3;

revoke all on table public.insights_detection_summary from anon, authenticated;
grant select on table public.insights_detection_summary to service_role;
