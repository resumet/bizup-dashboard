create or replace function public.save_course_post_sales_page(
  p_course uuid, p_workspace uuid, p_revision integer, p_draft jsonb, p_snapshot jsonb, p_origin text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  page public.course_post_sales_pages;
  payment text;
begin
  select c.payment_link into payment from public.courses c
    where c.id=p_course and c.workspace_id=p_workspace for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select * into page from public.course_post_sales_pages where course_id=p_course;
  if coalesce(page.revision, 0) <> p_revision then raise exception 'STALE_REVISION'; end if;
  if p_snapshot is not null and (p_snapshot->>'paymentUrl') is distinct from btrim(payment) then
    raise exception 'PAYMENT_CHANGED';
  end if;
  insert into public.course_post_sales_pages(course_id, draft, revision) values(p_course, p_draft, 1)
    on conflict(course_id) do update set draft=excluded.draft, revision=course_post_sales_pages.revision+1
    returning * into page;
  if p_snapshot is not null then
    update public.course_post_sales_pages set published=p_snapshot,
      public_url=coalesce(public_url, p_origin || '/public/post-sales/' || token::text)
      where course_id=p_course returning * into page;
  end if;
  return jsonb_build_object('revision',page.revision,'publicUrl',page.public_url);
end;
$$;
revoke all on function public.save_course_post_sales_page(uuid,uuid,integer,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.save_course_post_sales_page(uuid,uuid,integer,jsonb,jsonb,text) to service_role;
