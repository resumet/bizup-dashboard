-- A previously applied source file may be used again to restore deleted
-- enrollments or refresh existing enrollment data in a later roster version.
alter table public.job_file_versions
  drop constraint if exists job_file_versions_job_id_checksum_sha256_key;

create index if not exists job_file_versions_job_checksum_idx
  on public.job_file_versions (job_id, checksum_sha256);
