alter table public.courses
  add column if not exists required_tasks jsonb not null default
  '[
    {"key":"free-webinar-assets","title":"무료특강 배너 + 상페","dueDate":"","completed":false},
    {"key":"paid-course-assets","title":"유료특강 배너 + 상페 + 동영상","dueDate":"","completed":false},
    {"key":"course-materials","title":"교안","dueDate":"","completed":false}
  ]'::jsonb;

alter table public.courses
  drop constraint if exists courses_required_tasks_array_check;

alter table public.courses
  add constraint courses_required_tasks_array_check
  check (jsonb_typeof(required_tasks) = 'array');
