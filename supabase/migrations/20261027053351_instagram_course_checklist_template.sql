alter table public.instagram_management_checklists
  alter column items set default '[{"id":"account-login","title":"계정 로그인 완료했는지"},{"id":"blue-badge","title":"블루뱃지 받았나요?"},{"id":"instructor-video-upload","title":"강사님이 영상 업로드해주신 것 확인했나요?"},{"id":"filming-date-1","title":"강사님 1차 촬영 일자 확정했나요?"},{"id":"filming-date-2","title":"강사님 2차 촬영 일자 확정했나요?"},{"id":"filming-date-3","title":"강사님 3차 촬영 일자 확정했나요?"},{"id":"filming-date-4","title":"강사님 4차 촬영 일자 확정했나요?"}]'::jsonb;

update public.instagram_management_checklists
set items = '[{"id":"account-login","title":"계정 로그인 완료했는지"},{"id":"blue-badge","title":"블루뱃지 받았나요?"},{"id":"instructor-video-upload","title":"강사님이 영상 업로드해주신 것 확인했나요?"},{"id":"filming-date-1","title":"강사님 1차 촬영 일자 확정했나요?"},{"id":"filming-date-2","title":"강사님 2차 촬영 일자 확정했나요?"},{"id":"filming-date-3","title":"강사님 3차 촬영 일자 확정했나요?"},{"id":"filming-date-4","title":"강사님 4차 촬영 일자 확정했나요?"}]'::jsonb,
    updated_at = now()
where items = '[{"id":"kim-suna-login","title":"김선아님 로그인 했는지","completed":false},{"id":"shin-yeyoung-blue-badge","title":"신예영님 블루뱃지 받았는지","completed":false},{"id":"shin-yeyoung-video","title":"신예영님 영상 올라온거 확인됐는지","completed":false},{"id":"shin-yeyoung-filming-date","title":"신예영님 촬영 일자 확정했는지","completed":false}]'::jsonb;

update public.instagram_management_checklists as checklist
set items = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', item.value ->> 'id', 'title', item.value ->> 'title')
      order by item.ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(checklist.items) with ordinality as item(value, ordinality)
)
where exists (
  select 1
  from jsonb_array_elements(checklist.items) as item(value)
  where item.value ? 'completed'
);

comment on table public.instagram_management_checklists is
  '워크스페이스 공용 인스타그램 관리 체크리스트 템플릿';

create table public.course_instagram_checklist_states (
  course_id uuid primary key references public.courses(id) on delete cascade,
  completed_item_ids jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint course_instagram_checklist_states_completed_item_ids_array_check
    check (jsonb_typeof(completed_item_ids) = 'array')
);

comment on table public.course_instagram_checklist_states is
  '강의별 인스타그램 공용 체크리스트 완료 상태';

alter table public.course_instagram_checklist_states enable row level security;
revoke all on table public.course_instagram_checklist_states from public, anon, authenticated;
grant select, insert, update, delete on table public.course_instagram_checklist_states to service_role;

create index course_instagram_checklist_states_updated_by_idx
  on public.course_instagram_checklist_states(updated_by);
