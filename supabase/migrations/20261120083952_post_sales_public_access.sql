alter table public.course_post_sales_pages
  add column public_enabled boolean not null default true;

create function public.set_post_sales_public_access(
  p_course uuid, p_workspace uuid, p_revision integer, p_enabled boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  page public.course_post_sales_pages;
begin
  -- Serialize with draft saves and publication on the same course.
  perform 1 from public.courses where id = p_course and workspace_id = p_workspace for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.course_post_sales_pages
    set public_enabled = p_enabled, revision = revision + 1
    where course_id = p_course and revision = p_revision and published is not null and public_url is not null
    returning * into page;
  if not found then raise exception 'STALE_REVISION'; end if;
  return jsonb_build_object('revision', page.revision, 'publicUrl', page.public_url, 'enabled', page.public_enabled);
end;
$$;
revoke all on function public.set_post_sales_public_access(uuid,uuid,integer,boolean) from public, anon, authenticated;
grant execute on function public.set_post_sales_public_access(uuid,uuid,integer,boolean) to service_role;
