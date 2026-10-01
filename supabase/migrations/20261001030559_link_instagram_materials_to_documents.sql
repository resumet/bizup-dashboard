alter table public.course_instagram_materials
  add column if not exists document_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_documents_course_id_id_key'
      and conrelid = 'public.course_documents'::regclass
  ) then
    alter table public.course_documents
      add constraint course_documents_course_id_id_key
      unique (course_id, id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_instagram_materials_course_document_fkey'
      and conrelid = 'public.course_instagram_materials'::regclass
  ) then
    alter table public.course_instagram_materials
      add constraint course_instagram_materials_course_document_fkey
      foreign key (course_id, document_id)
      references public.course_documents (course_id, id)
      on delete restrict;
  end if;
end
$$;

create unique index if not exists course_instagram_materials_document_unique_idx
  on public.course_instagram_materials (course_id, document_id)
  where document_id is not null;

create or replace function public.unlink_instagram_material_after_document_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.course_instagram_materials
  set document_id = null,
      updated_at = now()
  where document_id = new.id;
  return new;
end;
$$;

drop trigger if exists unlink_instagram_material_after_document_delete
  on public.course_documents;
create trigger unlink_instagram_material_after_document_delete
after update of deleted_at on public.course_documents
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.unlink_instagram_material_after_document_delete();

revoke all on function public.unlink_instagram_material_after_document_delete()
  from public, anon, authenticated;
grant execute on function public.unlink_instagram_material_after_document_delete()
  to service_role;

comment on column public.course_instagram_materials.document_id is
  '강의별 인스타 자료 슬롯에 연결된 외부 강사 작성 문서';
