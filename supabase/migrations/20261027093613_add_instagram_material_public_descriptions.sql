alter table public.course_instagram_materials
  add column dm_material_description text not null default '',
  add column additional_description text not null default '';

alter table public.course_instagram_materials
  add constraint course_instagram_materials_dm_material_description_check
    check (char_length(dm_material_description) <= 5000),
  add constraint course_instagram_materials_additional_description_check
    check (char_length(additional_description) <= 5000);

comment on column public.course_instagram_materials.dm_material_description is
  '강사용 공개 작성 페이지에 표시하는 DM 자료 설명';

comment on column public.course_instagram_materials.additional_description is
  '강사용 공개 작성 페이지에 표시하는 부가 설명';
