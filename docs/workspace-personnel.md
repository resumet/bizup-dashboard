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

This project's historical migration ledger is incomplete. In particular, version `202609220001` was previously recorded for legacy personnel, while the current repository uses that version for annual leave reset. Do not blindly run `db push`, replay old migrations, or rewrite the historical ledger.

The dedicated command checks the linked project against `NEXT_PUBLIC_SUPABASE_URL`, verifies prerequisites, and applies only `202609230001_workspace_personnel.sql` transactionally. It records that exact SQL in migration history, rejects mismatched already-applied SQL, and leaves legacy `hr.personnel` and contract-document tables untouched.

```sh
npm run db:personnel -- --dry-run
npm run db:personnel
npm run db:personnel -- --payroll --dry-run
npm run db:personnel -- --payroll
```

The payroll flag applies only `202609230002_personnel_payroll.sql` after the initial personnel migration. Existing migration files/history remain unchanged. The payroll migration refuses to proceed if encrypted resident numbers exist, rather than losing those values or treating ciphertext as plaintext. This database had zero encrypted resident numbers when the change was applied; other installations must convert any existing encrypted values securely before proceeding.

If baseline task migrations are absent, the command stops. After reviewing the missing SQL, use `--with-missing-baseline` (also supported with `--dry-run`). This narrowly allows the three task migrations `202609190003` through `202609190005`, and only when their objects and ledger entries are absent. Partial application is rejected. Those dependencies and the personnel migration are then applied in one transaction, without rewriting existing history.

Initial records are populated from current workspace accounts and attendance employment dates. Historical records in the legacy HR schema are not migrated automatically. Inspect any legacy data before adopting this command on another database.

## Verification

```sh
npx tsx --conditions=react-server --test src/lib/personnel/personnel.test.ts
node scripts/verify-workspace-personnel.cjs
```

The browser verification requires Playwright (optionally provided via `PLAYWRIGHT_PACKAGE_PATH`) and Chromium. It runs the actual UI and API against migrated PGlite PostgreSQL, replacing only authentication and Supabase transport. It covers hiring, plaintext storage/reveal without an encryption key, payroll account leading zeros, resignation, rehiring, history, authorization, and desktop/mobile layouts. Screenshots are written to `.cache/workspace-personnel/`. It never changes real personnel records.
