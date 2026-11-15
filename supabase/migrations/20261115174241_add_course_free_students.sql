create table public.course_free_students (
  course_id uuid primary key references public.courses(id) on delete cascade,
  source_url text not null,
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index course_free_students_updated_by_idx on public.course_free_students(updated_by);
alter table public.course_free_students enable row level security;
revoke all on public.course_free_students from public, anon, authenticated;
grant select, insert, update, delete on public.course_free_students to service_role;
create policy "service role manages free students" on public.course_free_students
for all to service_role using (true) with check (true);
