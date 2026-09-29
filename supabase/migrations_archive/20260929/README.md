# Historical SQL — not for deployment

These 91 files were preserved unchanged when production was baselined on 2026-09-29.
They include duplicate versions, malformed historical SQL and destructive data
transformations. Do not run this directory against any database as a migration chain.

The active baseline is `../../migrations/202609290002_production_baseline.sql`.
Historical regression tests may load selected files into disposable databases.
`manifest.json` records original byte hashes and LF-normalized hashes for portable
verification with `npm run db:check`.

See [database migration operations](../../../docs/database-migrations.md).
