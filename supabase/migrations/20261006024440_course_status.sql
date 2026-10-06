alter table public.courses
  add column status text not null default 'ongoing';

update public.courses
set status = case
  when (
    (current_timestamp at time zone 'Asia/Seoul')::date
    - (free_webinar_at at time zone 'Asia/Seoul')::date
  ) >= 3 then 'completed'
  else 'ongoing'
end;

alter table public.courses
  add constraint courses_status_check
  check (status in ('ongoing', 'on_hold', 'completed', 'canceled'));

comment on column public.courses.status is
  '강의 운영 상태: ongoing(진행), on_hold(보류), completed(완료), canceled(취소)';
