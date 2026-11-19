alter table public.courses
  add column pre_question_form_link text not null default '',
  add column pre_question_responses_link text not null default '';
