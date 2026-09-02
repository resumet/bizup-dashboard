alter table public.message_jobs
  add column if not exists provider text not null default 'shoong';

alter table public.message_recipients
  add column if not exists provider text not null default 'shoong',
  add column if not exists provider_correlation_id text;

alter table public.address_book_message_jobs
  add column if not exists provider text not null default 'shoong';

alter table public.address_book_message_recipients
  add column if not exists provider text not null default 'shoong',
  add column if not exists provider_correlation_id text;
