create extension if not exists pgcrypto;

create table if not exists public.research_samples (
  id uuid primary key default gen_random_uuid(),
  sample_id text not null unique,
  hf_dataset_id text,
  hf_video_path text,
  source_dataset text not null,
  source_path text not null,
  split text not null check (split in ('train', 'validation', 'test', 'demo')),
  label text not null check (label in ('real', 'fake')),
  label_id integer not null check (label_id in (0, 1)),
  video_sha256 text not null unique check (length(video_sha256) = 64),
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  duration_sec numeric(10, 3),
  width integer,
  height integer,
  license text not null default 'research-only',
  consent_scope text not null check (
    consent_scope in ('owned_dataset', 'opt_in_user', 'public_benchmark', 'unknown')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.research_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  run_name text not null,
  model_version text not null,
  hf_dataset_id text,
  manifest_sha256 text,
  split text not null check (split in ('train', 'validation', 'test', 'demo')),
  threshold numeric(6, 5) not null default 0.5 check (threshold >= 0 and threshold <= 1),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_name)
);

create table if not exists public.research_predictions (
  id uuid primary key default gen_random_uuid(),
  evaluation_run_id uuid references public.research_evaluation_runs(id) on delete cascade,
  sample_id text not null references public.research_samples(sample_id) on delete cascade,
  model_version text not null,
  prediction_label text not null check (
    prediction_label in ('real', 'partially_real', 'partially_fake', 'fake')
  ),
  ai_probability numeric(6, 5) not null check (ai_probability >= 0 and ai_probability <= 1),
  confidence_percent numeric(5, 2) not null check (
    confidence_percent >= 0 and confidence_percent <= 100
  ),
  processing_time_sec numeric(10, 3),
  detection_id text,
  windows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (evaluation_run_id, sample_id)
);

create index if not exists research_samples_label_split_idx
  on public.research_samples (split, label);

create index if not exists research_samples_dataset_idx
  on public.research_samples (source_dataset, split);

create index if not exists research_predictions_run_idx
  on public.research_predictions (evaluation_run_id, ai_probability desc);

alter table public.research_samples enable row level security;
alter table public.research_evaluation_runs enable row level security;
alter table public.research_predictions enable row level security;

revoke all on table public.research_samples from anon, authenticated;
revoke all on table public.research_evaluation_runs from anon, authenticated;
revoke all on table public.research_predictions from anon, authenticated;

grant select, insert, update, delete on table public.research_samples to service_role;
grant select, insert, update, delete on table public.research_evaluation_runs to service_role;
grant select, insert, update, delete on table public.research_predictions to service_role;

create or replace view public.research_evaluation_summary
with (security_invoker = true)
as
select
  run_name,
  model_version,
  hf_dataset_id,
  split,
  threshold,
  metrics,
  created_at
from public.research_evaluation_runs
order by created_at desc;

revoke all on table public.research_evaluation_summary from anon, authenticated;
grant select on table public.research_evaluation_summary to service_role;
