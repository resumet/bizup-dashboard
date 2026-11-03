alter table public.youtube_analysis_batches
  add column if not exists is_reanalysis boolean not null default false,
  add column if not exists stop_requested boolean not null default false,
  add column if not exists paused_at timestamptz;

create index if not exists youtube_analysis_batches_reanalysis_resume_idx
  on public.youtube_analysis_batches(workspace_id, is_reanalysis, status, created_at desc);
