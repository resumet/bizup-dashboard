insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('youtube-brief-profile-photos', 'youtube-brief-profile-photos', true, 3145728, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Uploads are only performed by the token-validated server route.
-- No direct anonymous or authenticated Storage policies are granted.
