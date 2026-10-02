insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ad-performance-tracking-files',
  'ad-performance-tracking-files',
  false,
  15728640,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
