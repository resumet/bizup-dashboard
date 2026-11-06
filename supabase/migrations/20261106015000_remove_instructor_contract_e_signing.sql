-- 전자계약 공개 링크·서명 기능 제거
drop index if exists public.instructor_contracts_public_token_hash_idx;
drop index if exists public.instructor_contracts_workspace_completed_at_idx;

alter table public.instructor_contracts
  drop constraint if exists instructor_contracts_completed_signature_check,
  drop constraint if exists instructor_contracts_signer_method_check,
  drop constraint if exists instructor_contracts_signing_status_check,
  drop column if exists signer_ip_hash,
  drop column if exists signature_image_data,
  drop column if exists signer_method,
  drop column if exists signer_name,
  drop column if exists signed_at,
  drop column if exists public_token_created_at,
  drop column if exists public_token_hash,
  drop column if exists signing_status;
