create table if not exists public.course_notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  content text not null check (char_length(content) between 1 and 5000),
  created_by uuid not null references auth.users,
  author_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_notes_course_created_idx
  on public.course_notes (course_id, created_at desc);

alter table public.course_notes enable row level security;

create policy "members read course notes"
  on public.course_notes for select to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "members create own course notes"
  on public.course_notes for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "authors update own course notes"
  on public.course_notes for update to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "authors delete own course notes"
  on public.course_notes for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  );
