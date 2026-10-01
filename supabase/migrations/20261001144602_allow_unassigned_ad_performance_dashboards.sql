alter table public.ad_performance_dashboards
  alter column course_id drop not null;

drop policy if exists "members manage course ad performance dashboards"
  on public.ad_performance_dashboards;

create policy "members manage course ad performance dashboards"
  on public.ad_performance_dashboards
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and (
      course_id is null
      or exists (
        select 1
        from public.courses
        where courses.id = course_id
          and courses.workspace_id = ad_performance_dashboards.workspace_id
      )
    )
  );

comment on column public.ad_performance_dashboards.course_id is
  'Optional until a course is selected from the dashboard pre-settings dialog.';

notify pgrst, 'reload schema';
