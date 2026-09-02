alter table public.message_jobs
  add column if not exists delivery_checked_at timestamptz;

alter table public.message_recipients
  add column if not exists provider_status text,
  add column if not exists provider_result_code text,
  add column if not exists provider_result_message text,
  add column if not exists final_message_type text,
  add column if not exists delivery_checked_at timestamptz;

alter table public.address_book_message_jobs
  add column if not exists delivery_checked_at timestamptz;

alter table public.address_book_message_recipients
  add column if not exists provider_status text,
  add column if not exists provider_result_code text,
  add column if not exists provider_result_message text,
  add column if not exists final_message_type text,
  add column if not exists delivery_checked_at timestamptz;
