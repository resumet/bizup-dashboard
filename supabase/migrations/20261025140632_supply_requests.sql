create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requester_id uuid references auth.users(id) on delete set null,
  requester_name text not null,
  item_name text not null,
  price_krw bigint not null,
  purpose text not null,
  note text not null default '',
  approval_status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  purchased boolean not null default false,
  purchased_by uuid references auth.users(id) on delete set null,
  purchased_at timestamptz,
  version integer not null default 1,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supply_requests_requester_name_check
    check (char_length(btrim(requester_name)) between 1 and 100),
  constraint supply_requests_item_name_check
    check (char_length(btrim(item_name)) between 1 and 120),
  constraint supply_requests_price_krw_check
    check (price_krw between 0 and 9007199254740991),
  constraint supply_requests_purpose_check
    check (char_length(btrim(purpose)) between 1 and 1000),
  constraint supply_requests_note_check
    check (char_length(note) <= 2000),
  constraint supply_requests_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected')),
  constraint supply_requests_review_state_check
    check ((approval_status = 'pending') = (reviewed_at is null)),
  constraint supply_requests_purchase_state_check
    check (purchased = (purchased_at is not null) and (not purchased or approval_status = 'approved')),
  constraint supply_requests_version_check
    check (version > 0)
);

comment on table public.supply_requests is '워크스페이스 비품 신청 및 승인·구매 상태';
comment on column public.supply_requests.requester_name is '신청 당시 신청자 이름 스냅샷';
comment on column public.supply_requests.price_krw is '원 단위 정수 가격';

create index supply_requests_workspace_requested_at_idx
  on public.supply_requests (workspace_id, requested_at desc, id desc);
create index supply_requests_requester_idx
  on public.supply_requests (requester_id, requested_at desc)
  where requester_id is not null;
create index supply_requests_reviewed_by_idx
  on public.supply_requests (reviewed_by)
  where reviewed_by is not null;
create index supply_requests_purchased_by_idx
  on public.supply_requests (purchased_by)
  where purchased_by is not null;

alter table public.supply_requests enable row level security;

revoke all on table public.supply_requests from anon, authenticated;
grant select, insert, update, delete on table public.supply_requests to service_role;
