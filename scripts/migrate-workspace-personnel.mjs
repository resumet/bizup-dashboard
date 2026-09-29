// Retired after the production schema was consolidated into the 20260929 baseline.
// Do not load credentials, execute SQL, or restore obsolete migration history here.
console.error(
  "db:personnel 명령은 마이그레이션 기준 이력 통합으로 폐기되었습니다. " +
  "docs/database-migrations.md를 확인하고 supabase db push --dry-run으로 새 변경만 점검하세요. " +
  "기존 운영 DB에서 기준 파일이나 migrations_archive의 SQL을 다시 실행하면 안 됩니다.",
);
process.exitCode = 1;
