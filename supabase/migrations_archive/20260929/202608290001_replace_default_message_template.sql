do $$
declare
  target_template_id uuid;
begin
  select id into target_template_id
  from public.message_templates
  where template_code = 'dedicated_entry_link_guide_2'
  order by is_system desc, created_at asc
  limit 1;

  if target_template_id is null then
    select id into target_template_id
    from public.message_templates
    where is_system = true
      and template_code = 'dedicated_entry_link_guide'
    order by created_at asc
    limit 1;
  end if;

  if target_template_id is null then
    insert into public.message_templates (
      name,
      template_code,
      applicant_variable,
      course_variable,
      variable_names,
      is_system
    ) values (
      '무료 강의 입장 안내 2',
      'dedicated_entry_link_guide_2',
      '신청자',
      '강좌명',
      '["신청자", "강좌명", "링크"]'::jsonb,
      true
    )
    returning id into target_template_id;
  else
    update public.message_templates
    set
      name = '무료 강의 입장 안내 2',
      template_code = 'dedicated_entry_link_guide_2',
      applicant_variable = '신청자',
      course_variable = '강좌명',
      variable_names = '["신청자", "강좌명", "링크"]'::jsonb,
      is_system = true
    where id = target_template_id;
  end if;

  delete from public.message_templates template
  where template.id <> target_template_id
    and template.is_system = true
    and template.template_code = 'dedicated_entry_link_guide'
    and not exists (
      select 1
      from public.address_book_message_jobs job
      where job.template_id = template.id
    );
end
$$;
