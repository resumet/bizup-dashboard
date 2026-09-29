-- 기존 발송 기록은 테스트 데이터이므로 비우고 템플릿 참조 키를 다시 구성한다.
truncate table public.address_book_message_jobs cascade;

alter table public.address_book_message_jobs
  drop constraint if exists address_book_message_jobs_template_id_fkey;

-- 같은 Shoong templatecode가 여러 번 저장된 경우 워크스페이스 템플릿을 우선해 하나로 정리한다.
with ranked_templates as (
  select
    id,
    row_number() over (
      partition by trim(template_code)
      order by
        (workspace_id is null) asc,
        is_system asc,
        created_at desc,
        id desc
    ) as position
  from public.message_templates
)
delete from public.message_templates template
using ranked_templates ranked
where template.id = ranked.id
  and ranked.position > 1;

update public.message_templates
set template_code = trim(template_code)
where template_code <> trim(template_code);

alter table public.message_templates
  drop constraint if exists message_templates_pkey;

alter table public.message_templates
  alter column id drop default;

alter table public.message_templates
  alter column id type text using template_code;

alter table public.message_templates
  add constraint message_templates_pkey primary key (id);

alter table public.message_templates
  drop constraint if exists message_templates_id_matches_code_check;

alter table public.message_templates
  add constraint message_templates_id_matches_code_check
  check (id = template_code);

alter table public.address_book_message_jobs
  alter column template_id type text using template_id::text;

alter table public.address_book_message_jobs
  add constraint address_book_message_jobs_template_id_fkey
  foreign key (template_id) references public.message_templates(id);
