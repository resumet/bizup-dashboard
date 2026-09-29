alter table public.courses
  add column if not exists banner_image_path text not null default '';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'course-banners',
  'course-banners',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "members read course banners" on storage.objects;
create policy "members read course banners"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'course-banners'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "members upload course banners" on storage.objects;
create policy "members upload course banners"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'course-banners'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "members update course banners" on storage.objects;
create policy "members update course banners"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'course-banners'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'course-banners'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "members delete course banners" on storage.objects;
create policy "members delete course banners"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'course-banners'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );
