create table public.instructor_intakes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  access_token_hash text not null unique check (access_token_hash ~ '^[a-f0-9]{64}$'),
  share_enabled boolean not null default true,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 5),
  revision integer not null default 0 check (revision >= 0),
  submitted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Raw share tokens are only visible to members of the corresponding workspace.
alter table public.instructor_intakes add column access_token text not null
  check (access_token ~ '^[a-f0-9]{48}$');
create index instructor_intakes_workspace_updated_idx on public.instructor_intakes(workspace_id, updated_at desc);
alter table public.instructor_intakes enable row level security;
revoke all on public.instructor_intakes from anon, authenticated;
grant select on public.instructor_intakes to authenticated;
grant all on public.instructor_intakes to service_role;
create policy instructor_intakes_member_read on public.instructor_intakes
  for select to authenticated using (public.is_workspace_member(workspace_id));

create function public.touch_instructor_intake() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.revision = old.revision + 1;
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_instructor_intake() from public, anon, authenticated;
create trigger touch_instructor_intake before update on public.instructor_intakes
  for each row execute function public.touch_instructor_intake();

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('instructor-profile-photos', 'instructor-profile-photos', false, 3145728, array['image/webp']);
-- Uploads and signed downloads are authorized by server-side workspace/token checks.
-- No anonymous or authenticated direct Storage policies are granted.
