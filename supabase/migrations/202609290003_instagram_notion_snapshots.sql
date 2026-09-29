create table if not exists public.course_instagram_notion_snapshots (
  course_id uuid not null,
  position smallint not null,
  notion_page_id text not null,
  source_url text not null,
  page_title text not null default '',
  content jsonb not null default '[]'::jsonb,
  notion_last_edited_at timestamptz,
  synced_at timestamptz not null default now(),
  synced_by uuid references auth.users(id) on delete set null,
  primary key (course_id, position),
  constraint course_instagram_notion_snapshots_material_fkey
    foreign key (course_id, position)
    references public.course_instagram_materials(course_id, position)
    on delete cascade,
  constraint course_instagram_notion_snapshots_position_check
    check (position between 1 and 40),
  constraint course_instagram_notion_snapshots_page_id_check
    check (notion_page_id ~ '^[0-9a-f]{32}$'),
  constraint course_instagram_notion_snapshots_source_url_check
    check (char_length(source_url) between 1 and 2048),
  constraint course_instagram_notion_snapshots_page_title_check
    check (char_length(page_title) <= 500),
  constraint course_instagram_notion_snapshots_content_check
    check (jsonb_typeof(content) = 'array' and octet_length(content::text) <= 2097152)
);

alter table public.course_instagram_notion_snapshots enable row level security;

create policy "members manage course instagram notion snapshots"
on public.course_instagram_notion_snapshots
to authenticated
using (
  exists (
    select 1
    from public.courses c
    where c.id = course_instagram_notion_snapshots.course_id
      and public.is_workspace_member(c.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.courses c
    where c.id = course_instagram_notion_snapshots.course_id
      and public.is_workspace_member(c.workspace_id)
  )
);

revoke all on table public.course_instagram_notion_snapshots from anon;
grant select, insert, update, delete on table public.course_instagram_notion_snapshots to authenticated;
grant all on table public.course_instagram_notion_snapshots to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instagram-notion-assets',
  'instagram-notion-assets',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
