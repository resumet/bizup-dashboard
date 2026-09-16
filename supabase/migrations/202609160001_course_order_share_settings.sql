alter table public.courses
  add column if not exists order_roster_share_enabled boolean not null default true;

comment on column public.courses.order_roster_share_enabled is
  'Whether the signed public course order roster link is accessible.';
