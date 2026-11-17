-- Instagram notifications were retired in 20261103083529. The old writer still
-- inserted that forbidden kind, rolling back every changed document save.
create or replace function public.save_external_instagram_document(
  p_token text, p_document_id uuid, p_content jsonb
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  setting public.course_document_settings;
  doc public.course_documents;
  material_title text;
  keep_gate boolean;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then raise exception 'NOT_FOUND'; end if;
  select * into setting from public.course_document_settings
    where external_access_token=p_token for update;
  if not found or not setting.external_edit_enabled then raise exception 'NOT_FOUND'; end if;
  if p_content is null or jsonb_typeof(p_content) <> 'array' then raise exception 'INVALID_CONTENT'; end if;
  select * into doc from public.course_documents
    where id=p_document_id and course_id=setting.course_id
      and workspace_id=setting.workspace_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select title into material_title from public.course_instagram_materials
    where course_id=setting.course_id and document_id=p_document_id and not dm_not_required;
  if nullif(btrim(material_title),'') is null then raise exception 'NOT_FOUND'; end if;
  keep_gate := doc.lead_gate_enabled and exists(
    select 1 from jsonb_array_elements(p_content) with ordinality b(value,position)
    where value->>'id'=doc.lead_gate_after_block_id and position<jsonb_array_length(p_content)
  );
  update public.course_documents set title=material_title, content=p_content,
    status='draft', published_at=null, lead_gate_enabled=keep_gate,
    lead_gate_after_block_id=case when keep_gate then doc.lead_gate_after_block_id else null end
    where id=doc.id;
  return jsonb_build_object('success',true);
end;
$$;

revoke all on function public.save_external_instagram_document(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_external_instagram_document(text,uuid,jsonb) to service_role;
