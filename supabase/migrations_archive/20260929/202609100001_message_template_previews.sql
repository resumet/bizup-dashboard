create table public.message_template_previews (
  workspace_id uuid not null references public.workspaces on delete cascade,
  template_id text not null references public.message_templates on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  primary key (workspace_id, template_id)
);

alter table public.message_template_previews enable row level security;

create policy "members manage template previews"
on public.message_template_previews for all to authenticated
using (public.is_workspace_member(workspace_id))
with check (
  public.is_workspace_member(workspace_id)
  and exists (
    select 1 from public.message_templates t
    where t.id = template_id and (t.workspace_id is null or t.workspace_id = message_template_previews.workspace_id)
  )
);
