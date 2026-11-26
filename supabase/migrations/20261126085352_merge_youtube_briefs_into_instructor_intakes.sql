-- Keep the original brief as an archive and merge only its sections 3–5.
lock table public.course_youtube_settings, public.instructor_intakes in share row exclusive mode;

create temporary table intake_youtube_backfill on commit drop as
select s.course_id, s.workspace_id, jsonb_object_agg(field.key, field.value) as application
from public.course_youtube_settings s
cross join lateral jsonb_each_text(s.brief) field
where field.key in ('onlineChannels', 'previousAppearances', 'desiredChannels', 'goals',
                    'concept', 'thumbnail', 'intro', 'scenes')
  and btrim(field.value) <> ''
group by s.course_id, s.workspace_id;

do $$
begin
  if exists (
    select 1 from intake_youtube_backfill b
    where (select count(*) from public.instructor_intakes i
           where i.workspace_id = b.workspace_id and i.course_id = b.course_id) <> 1
  ) then
    raise exception 'Cannot uniquely match a YouTube application to its instructor intake';
  end if;
end;
$$;

update public.instructor_intakes i
set answers = jsonb_set(i.answers, '{youtubeApplication}',
  b.application || coalesce(i.answers->'youtubeApplication', '{}'::jsonb))
from intake_youtube_backfill b
where i.course_id = b.course_id and i.workspace_id = b.workspace_id;

-- Legacy profile images are WebP files. Their bytes must first be copied through
-- the Storage API into the private intake folder and verified before linking.
update public.instructor_intakes i
set photo_paths = array[o.name]
from public.course_youtube_settings s, storage.objects o
where i.course_id = s.course_id and i.workspace_id = s.workspace_id
  and cardinality(i.photo_paths) = 0
  and o.bucket_id = 'instructor-profile-photos'
  and o.name = i.workspace_id::text || '/' || i.id::text || '/' ||
    substring(s.brief->>'profilePhoto' from '/([0-9a-f]{32}[.]webp)$');

update public.course_youtube_settings set brief_enabled = false where brief_enabled;
alter table public.course_youtube_settings add constraint youtube_brief_retired check (not brief_enabled);
update storage.buckets set public = false where id = 'youtube-brief-profile-photos' and public;
