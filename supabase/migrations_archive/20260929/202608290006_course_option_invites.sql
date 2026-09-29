alter table public.course_options
  add column if not exists group_chat_link text not null default '',
  add column if not exists entry_code text not null default '';

comment on column public.course_options.group_chat_link is
  'Option-specific paid course group chat URL';
comment on column public.course_options.entry_code is
  'Option-specific paid course group chat entry code';
명