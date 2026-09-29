create index if not exists address_book_contacts_book_name_id_idx
  on public.address_book_contacts (address_book_id, name, id);

create index if not exists address_book_message_jobs_book_created_idx
  on public.address_book_message_jobs (address_book_id, created_at desc);

create index if not exists audit_logs_workspace_event_created_idx
  on public.audit_logs (workspace_id, event_type, created_at desc);

create index if not exists audit_logs_entity_event_created_idx
  on public.audit_logs (entity_id, event_type, created_at desc);

create index if not exists course_jobs_workspace_updated_idx
  on public.course_jobs (workspace_id, updated_at desc);

create index if not exists address_books_workspace_updated_idx
  on public.address_books (workspace_id, updated_at desc);
