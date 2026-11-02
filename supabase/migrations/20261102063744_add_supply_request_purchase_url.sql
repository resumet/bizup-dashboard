alter table public.supply_requests
  add column purchase_url text;

alter table public.supply_requests
  add constraint supply_requests_purchase_url_check
  check (
    purchase_url is null
    or (
      char_length(purchase_url) between 1 and 2048
      and purchase_url ~* '^https?://[^[:space:]]+$'
    )
  );

comment on column public.supply_requests.purchase_url is '신청자가 입력한 HTTP(S) 구매 링크';
