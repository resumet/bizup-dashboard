-- WBS templates are shared with workspace members, but only the server's
-- service-role path may update the single template after checking super admin.
drop policy if exists "members manage course wbs templates" on public.course_wbs_templates;
drop policy if exists "members read course wbs templates" on public.course_wbs_templates;

create policy "members read course wbs templates"
  on public.course_wbs_templates for select to authenticated
  using (public.is_workspace_member(workspace_id));

revoke insert, update, delete on public.course_wbs_templates from public, anon, authenticated;
grant select on public.course_wbs_templates to authenticated;

notify pgrst, 'reload schema';
