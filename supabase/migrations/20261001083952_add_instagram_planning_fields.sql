alter table public.course_document_settings
  add column if not exists planning_sheet_url text not null default '';

alter table public.course_instagram_materials
  add column if not exists reference_planning_number text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_document_settings_planning_sheet_url_check'
      and conrelid = 'public.course_document_settings'::regclass
  ) then
    alter table public.course_document_settings
      add constraint course_document_settings_planning_sheet_url_check
      check (
        planning_sheet_url = ''
        or (
          char_length(planning_sheet_url) <= 2048
          and planning_sheet_url ~* '^https?://'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_instagram_materials_reference_planning_number_check'
      and conrelid = 'public.course_instagram_materials'::regclass
  ) then
    alter table public.course_instagram_materials
      add constraint course_instagram_materials_reference_planning_number_check
      check (
        reference_planning_number = ''
        or reference_planning_number ~ '^[0-9]{2}$'
      );
  end if;
end
$$;

comment on column public.course_document_settings.planning_sheet_url is
  '강의별 인스타그램 기획시트 URL';

comment on column public.course_instagram_materials.reference_planning_number is
  '인스타 자료에 연결하는 두 자리 참고기획번호';
