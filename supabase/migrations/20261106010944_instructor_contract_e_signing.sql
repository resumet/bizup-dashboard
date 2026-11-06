alter table public.instructor_contracts
  add column signing_status text not null default 'pending',
  add column public_token_hash text,
  add column public_token_created_at timestamptz,
  add column signer_name text,
  add column signer_method text,
  add column signature_image_data text,
  add column signer_ip_hash text,
  add column signed_at timestamptz,
  add constraint instructor_contracts_signing_status_check
    check (signing_status in ('pending', 'completed')),
  add constraint instructor_contracts_signer_method_check
    check (signer_method is null or signer_method in ('signature', 'seal')),
  add constraint instructor_contracts_completed_signature_check
    check (
      (signing_status = 'pending' and signer_name is null and signer_method is null and signature_image_data is null and signer_ip_hash is null and signed_at is null)
      or
      (signing_status = 'completed' and char_length(btrim(signer_name)) between 1 and 200 and signer_method is not null and signature_image_data is not null and signer_ip_hash is not null and signed_at is not null)
    );

create unique index instructor_contracts_public_token_hash_idx
  on public.instructor_contracts (public_token_hash)
  where public_token_hash is not null;

create index instructor_contracts_workspace_completed_at_idx
  on public.instructor_contracts (workspace_id, signed_at desc, id desc)
  where signing_status = 'completed';

comment on column public.instructor_contracts.public_token_hash is
  'SHA-256 digest of the bearer token used by the public signing link. The raw token is never persisted.';
comment on column public.instructor_contracts.signature_image_data is
  'PNG data URL of the signer-drawn signature or generated seal, captured when the contract is completed.';
