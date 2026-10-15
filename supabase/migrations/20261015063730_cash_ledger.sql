create schema if not exists ledger_private;
revoke all on schema ledger_private from public, anon;
grant usage on schema ledger_private to authenticated, service_role;

create table public.cash_ledger_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  start_date date not null check (start_date between '2000-01-01' and '2100-12-31'),
  opening_balance bigint not null check (opening_balance between -1000000000000 and 1000000000000),
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
create table public.cash_ledger_parties (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  bank_name text not null default '' check (char_length(bank_name) <= 100),
  account_number text not null default '' check (char_length(account_number) <= 100),
  account_holder text not null default '' check (char_length(account_holder) <= 120),
  note text not null default '' check (char_length(note) <= 2000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index cash_ledger_parties_workspace_idx on public.cash_ledger_parties(workspace_id);
create table public.cash_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  workspace_id uuid not null references public.cash_ledger_settings(workspace_id),
  kind text not null check (kind in ('expense', 'income')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  party_id uuid not null,
  course_id uuid references public.courses(id) on delete set null,
  amount bigint not null check (amount between 1 and 1000000000000),
  entry_date date not null check (entry_date between '2000-01-01' and '2100-12-31'),
  note text not null default '' check (char_length(note) <= 4000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (party_id, workspace_id) references public.cash_ledger_parties(id, workspace_id)
);
create index cash_ledger_entries_workspace_date_idx on public.cash_ledger_entries(workspace_id, entry_date desc, entry_number desc);
create index cash_ledger_entries_party_idx on public.cash_ledger_entries(party_id, workspace_id);
create index cash_ledger_entries_course_idx on public.cash_ledger_entries(course_id);
create table public.cash_ledger_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  entry_id uuid not null,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null,
  file_size integer not null check (file_size between 1 and 4194304),
  created_at timestamptz not null default now(),
  foreign key (entry_id, workspace_id) references public.cash_ledger_entries(id, workspace_id) on delete cascade
);
create index cash_ledger_attachments_entry_idx on public.cash_ledger_attachments(entry_id, workspace_id);
create index cash_ledger_attachments_workspace_idx on public.cash_ledger_attachments(workspace_id);

create function ledger_private.guard_record() returns trigger language plpgsql set search_path = '' as $$
declare ledger_start date;
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'Workspace cannot change' using errcode = '23514';
    end if;
    new.version := old.version + 1;
  else new.version := 1;
  end if;
  new.updated_at := clock_timestamp();
  if tg_table_name = 'cash_ledger_entries' then
    -- Serialize entry writes against opening-date changes.
    select start_date into ledger_start from public.cash_ledger_settings where workspace_id = new.workspace_id for update;
    if ledger_start is null or new.entry_date < ledger_start then
      raise exception 'Entry predates opening balance' using errcode = '23514';
    end if;
    if new.course_id is not null and not exists (
      select 1 from public.courses where id = new.course_id and workspace_id = new.workspace_id
    ) then raise exception 'Course must belong to same workspace' using errcode = '23514'; end if;
  elsif tg_table_name = 'cash_ledger_settings' then
    if exists (select 1 from public.cash_ledger_entries where workspace_id = new.workspace_id and entry_date < new.start_date) then
      raise exception 'Opening date excludes existing entries' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function ledger_private.guard_record() from public, anon, authenticated;
create trigger cash_ledger_settings_guard before insert or update on public.cash_ledger_settings for each row execute function ledger_private.guard_record();
create trigger cash_ledger_parties_guard before insert or update on public.cash_ledger_parties for each row execute function ledger_private.guard_record();
create trigger cash_ledger_entries_guard before insert or update on public.cash_ledger_entries for each row execute function ledger_private.guard_record();

alter table public.cash_ledger_settings enable row level security;
alter table public.cash_ledger_parties enable row level security;
alter table public.cash_ledger_entries enable row level security;
alter table public.cash_ledger_attachments enable row level security;
revoke all on public.cash_ledger_settings, public.cash_ledger_parties, public.cash_ledger_entries, public.cash_ledger_attachments from anon, authenticated;
grant select, insert on public.cash_ledger_settings, public.cash_ledger_parties to authenticated;
grant select, insert, delete on public.cash_ledger_entries to authenticated;
grant select on public.cash_ledger_attachments to authenticated;
grant update (start_date, opening_balance) on public.cash_ledger_settings to authenticated;
grant update (name, bank_name, account_number, account_holder, note) on public.cash_ledger_parties to authenticated;
grant update (kind, title, party_id, course_id, amount, entry_date, note) on public.cash_ledger_entries to authenticated;
grant usage on sequence public.cash_ledger_entries_entry_number_seq to authenticated;
grant all on public.cash_ledger_settings, public.cash_ledger_parties, public.cash_ledger_entries, public.cash_ledger_attachments to service_role;
grant all on sequence public.cash_ledger_entries_entry_number_seq to service_role;

-- Reuse the established membership + active-account check (no editable JWT metadata).
create policy cash_settings_access on public.cash_ledger_settings for all to authenticated
  using ((select calendar_private.has_access(workspace_id))) with check ((select calendar_private.has_access(workspace_id)));
create policy cash_parties_access on public.cash_ledger_parties for all to authenticated
  using ((select calendar_private.has_access(workspace_id))) with check ((select calendar_private.has_access(workspace_id)));
create policy cash_entries_access on public.cash_ledger_entries for all to authenticated
  using ((select calendar_private.has_access(workspace_id))) with check ((select calendar_private.has_access(workspace_id)));
create policy cash_attachments_read on public.cash_ledger_attachments for select to authenticated
  using ((select calendar_private.has_access(workspace_id)));

-- Files are accessed only through membership-checked server routes; no public bucket or direct writes.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('cash-ledger-evidence', 'cash-ledger-evidence', false, 4194304,
  array['image/png','image/jpeg','image/webp','image/gif','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv']);
