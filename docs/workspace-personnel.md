# Workspace Personnel

## Access and data

- The home page separates Dashboard (`/work`), Work (`/hr`), and Attendance (`/hr/leave`). Personnel is available at `/hr/personnel` only to the existing workspace super administrator.
- Page, API, and database RPCs independently enforce administrator access. Private personnel tables cannot be read directly by browser clients.
- Employee IDs are independent of login accounts. An employee can be registered before an account exists, then linked to an available account in the same workspace. This feature does not create or invite authentication accounts.
- Hiring, rehiring, resignation, and dismissal retain employment periods and audit events. Departure does not delete the employee or authentication account. Open assigned tasks must be transferred or completed first. Inactive employees cannot access workspace tasks or attendance data, receive open tasks, or create leave requests/support records.
- Existing annual grants, extra earned leave, approved usage, pending requests, and remaining balance are read from the current attendance tables. Future approved leave is shown separately; it is already included in approved usage and must not be deducted twice. Personnel updates never recalculate or overwrite annual grants.
- Employee profile updates use an optimistic version check. Lifecycle changes and employment-date synchronization to attendance profiles are transactional.

## Resident numbers and payroll accounts

Resident numbers are stored as plaintext following the requested storage change. The application no longer uses or requires `HR_PERSONNEL_ENCRYPTION_KEY`. Database and backup access can expose these values; restrict access accordingly.

Normal list/detail responses still exclude resident numbers. Explicit administrator reveal is audited, uses a no-store response, and the browser hides the value after 30 seconds. Do not log request bodies or reveal responses. Bank name and payroll account number are editable in the administrator-only employee detail. Account numbers are strings, preserving leading zeros and separators, and remain stored after departure.

## Migration

The production schema is now managed from `supabase/migrations/202609290002_production_baseline.sql`. Personnel and payroll objects are included in that baseline. Follow the [database migration guide](database-migrations.md); never execute the baseline again on the existing production database or deploy historical SQL from `supabase/migrations_archive/20260929`.

```sh
supabase db push --linked --dry-run
supabase db push --linked
```

Review the target project and planned changes before the second command. Only new migrations should be applied to an existing, baselined production database. The old `npm run db:personnel` command and its `--payroll` / `--with-missing-baseline` options are retired; the script exits without loading credentials or contacting the database.

The archived payroll SQL is retained for historical regression tests. Its original encrypted-value checks and data transformations must not be bypassed or replayed on production. The baseline records the current schema; it does not copy employee data, initialize accounts, or automatically migrate legacy HR records on a new installation. Consult the migration guide before preparing another database.

## Verification

```sh
npx tsx --conditions=react-server --test src/lib/personnel/personnel.test.ts
node scripts/verify-workspace-personnel.cjs
```

The browser verification requires Playwright (optionally provided via `PLAYWRIGHT_PACKAGE_PATH`) and Chromium. It runs the actual UI and API against migrated PGlite PostgreSQL, replacing only authentication and Supabase transport. It covers hiring, plaintext storage/reveal without an encryption key, payroll account leading zeros, resignation, rehiring, history, authorization, and desktop/mobile layouts. Screenshots are written to `.cache/workspace-personnel/`. It never changes real personnel records.
