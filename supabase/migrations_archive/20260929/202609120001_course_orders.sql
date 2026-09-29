create table public.course_order_imports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  file_name text not null,
  row_count integer not null check (row_count > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.course_orders (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  record_key text not null,
  product_name text not null,
  option_name text not null default '',
  member_name text not null default '',
  phone text not null default '',
  email text not null default '',
  payment_amount numeric(15,2) not null,
  refund_amount numeric(15,2) not null,
  current_amount numeric(15,2) not null,
  status text not null default '',
  payment_method text not null default '',
  rs text not null default '',
  ad_media text not null default '',
  inflow_type text not null default '',
  payment_id text not null default '',
  order_id text not null default '',
  refund_date date,
  import_id uuid not null references public.course_order_imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, record_key)
);
create index course_orders_course_updated_idx on public.course_orders(course_id, updated_at desc, id);
create index course_order_imports_course_created_idx on public.course_order_imports(course_id, created_at desc);
alter table public.course_orders enable row level security;
alter table public.course_order_imports enable row level security;

create policy course_orders_member_read on public.course_orders for select to authenticated
using (exists (
  select 1 from public.courses c join public.workspace_members m on m.workspace_id = c.workspace_id
  where c.id = course_orders.course_id and m.user_id = auth.uid()
));
create policy course_order_imports_member_read on public.course_order_imports for select to authenticated
using (exists (
  select 1 from public.courses c join public.workspace_members m on m.workspace_id = c.workspace_id
  where c.id = course_order_imports.course_id and m.user_id = auth.uid()
));

-- One transaction per file: failures never leave partial orders or import history.
create function public.import_course_orders(p_course_id uuid, p_actor_id uuid, p_file_name text, p_rows jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_import_id uuid;
begin
  select workspace_id into v_workspace_id from public.courses where id = p_course_id for update;
  if v_workspace_id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_workspace_id and user_id = p_actor_id
  ) then
    raise exception '주문 내역을 관리할 권한이 없습니다.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception '주문 내역 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 10000 then
    raise exception '한 번에 1~10,000건을 저장할 수 있습니다.';
  end if;
  insert into public.course_order_imports(course_id, file_name, row_count, created_by)
  values (p_course_id, p_file_name, jsonb_array_length(p_rows), p_actor_id)
  returning id into v_import_id;

  insert into public.course_orders (
    course_id, record_key, product_name, option_name, member_name, phone, email,
    payment_amount, refund_amount, current_amount, status, payment_method, rs,
    ad_media, inflow_type, payment_id, order_id, refund_date, import_id
  )
  select p_course_id, r.record_key, r.product_name, r.option_name, r.member_name, r.phone, r.email,
    r.payment_amount, r.refund_amount, r.current_amount, r.status, r.payment_method, r.rs,
    r.ad_media, r.inflow_type, r.payment_id, r.order_id, r.refund_date, v_import_id
  from jsonb_to_recordset(p_rows) as r(
    record_key text, product_name text, option_name text, member_name text, phone text, email text,
    payment_amount numeric, refund_amount numeric, current_amount numeric, status text,
    payment_method text, rs text, ad_media text, inflow_type text, payment_id text, order_id text, refund_date date
  )
  on conflict (course_id, record_key) do update set
    product_name = excluded.product_name, option_name = excluded.option_name,
    member_name = excluded.member_name, phone = excluded.phone, email = excluded.email,
    payment_amount = excluded.payment_amount, refund_amount = excluded.refund_amount,
    current_amount = excluded.current_amount, status = excluded.status,
    payment_method = excluded.payment_method, rs = excluded.rs, ad_media = excluded.ad_media,
    inflow_type = excluded.inflow_type, payment_id = excluded.payment_id, order_id = excluded.order_id,
    refund_date = excluded.refund_date, import_id = excluded.import_id, updated_at = now();
  return v_import_id;
end;
$$;
revoke all on function public.import_course_orders(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.import_course_orders(uuid, uuid, text, jsonb) to service_role;
grant select on public.course_orders, public.course_order_imports to authenticated;
grant all on public.course_orders, public.course_order_imports to service_role;
