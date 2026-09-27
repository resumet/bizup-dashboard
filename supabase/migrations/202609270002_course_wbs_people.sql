-- Keep previously entered WBS assignees available as workspace-specific choices.
create table if not exists public.course_wbs_people (
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null check (char_length(name) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (workspace_id, name)
);

alter table public.course_wbs_people enable row level security;

drop policy if exists "members manage course wbs people" on public.course_wbs_people;
create policy "members manage course wbs people"
  on public.course_wbs_people for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.course_wbs_people to authenticated;

insert into public.course_wbs_people (workspace_id, name)
select distinct workspace_id, name
from (
  select w.workspace_id, btrim(item.value ->> field.field_name) as name
  from public.course_wbs as w
  cross join lateral jsonb_array_elements(w.items) as item(value)
  cross join (values ('owner'), ('stakeholders')) as field(field_name)

  union all

  select t.workspace_id, btrim(item.value ->> field.field_name) as name
  from public.course_wbs_templates as t
  cross join lateral jsonb_array_elements(t.items) as item(value)
  cross join (values ('owner'), ('stakeholders')) as field(field_name)
) as existing_people
where name is not null and char_length(name) between 1 and 500
on conflict (workspace_id, name) do nothing;

notify pgrst, 'reload schema';
