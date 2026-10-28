alter table public.courses
  add column if not exists course_canva_link text not null default '';

comment on column public.courses.course_canva_link is
  'Canva course material URL managed separately from the instructor materials folder';

update public.courses as course
set course_canva_link = (
  select btrim(link.value ->> 'url')
  from jsonb_array_elements(course.custom_links) with ordinality as link(value, position)
  where position('교안' in coalesce(link.value ->> 'name', '')) > 0
    and btrim(coalesce(link.value ->> 'url', '')) <> ''
  order by link.position
  limit 1
)
where btrim(course.course_canva_link) = ''
  and exists (
    select 1
    from jsonb_array_elements(course.custom_links) as link(value)
    where position('교안' in coalesce(link.value ->> 'name', '')) > 0
      and btrim(coalesce(link.value ->> 'url', '')) <> ''
  );
