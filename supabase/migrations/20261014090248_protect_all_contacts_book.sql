-- Preserve the existing book ID, contacts, imports, course links and message history.
update public.address_books
set name = '전체 명단'
where name = '비즈업-전체-1013';

create unique index address_books_all_contacts_workspace_key
on public.address_books (workspace_id)
where btrim(name) = '전체 명단';

create function public.protect_all_contacts_book()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if btrim(old.name) = '전체 명단' then
    if tg_op = 'DELETE' then
      raise exception '전체 명단은 삭제할 수 없습니다.' using errcode = '23514';
    end if;
    if new.name is distinct from old.name
      or new.id is distinct from old.id
      or new.workspace_id is distinct from old.workspace_id then
      raise exception '전체 명단은 이름이나 소속을 변경할 수 없습니다.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_all_contacts_book() from public;

create trigger protect_all_contacts_book
before update or delete on public.address_books
for each row execute function public.protect_all_contacts_book();
