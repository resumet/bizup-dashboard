import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

loadEnvConfig(process.cwd());
const literal = (value: string) => "'" + value.replace(/'/g, "''") + "'";
async function main() {
  const email = process.env.HR_INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("HR_INITIAL_ADMIN_EMAIL을 먼저 설정해 주세요.");
  const files = (await readdir("supabase/migrations")).filter(name => /^20260914\d+_hr_/.test(name)).sort();
  if (files.length !== 7) throw new Error("HR 마이그레이션 7개를 확인해 주세요.");
  const migrations = await Promise.all(files.map(async name => `-- ${name}\n${await readFile(`supabase/migrations/${name}`, "utf8")}`));
  const sql = `-- HR first installation only. Run the entire file in Supabase SQL Editor as postgres.
-- Includes seven migrations and links the existing authentication account as initial HR admin.
-- If any step fails, the transaction rolls back. Do not rerun after successful installation.
BEGIN;
DO $$ BEGIN
  IF to_regnamespace('hr') IS NOT NULL THEN
    RAISE EXCEPTION 'HR schema already exists. Use incremental migrations instead of first installation.';
  END IF;
END $$;

${migrations.join("\n\n")}

DO $hr_install$
DECLARE initial_auth_id uuid;
BEGIN
  SELECT id INTO initial_auth_id FROM auth.users WHERE lower(email)=${literal(email)};
  IF initial_auth_id IS NULL THEN
    RAISE EXCEPTION 'The configured initial HR administrator must have an existing authentication account.';
  END IF;
  PERFORM public.hr_bootstrap(initial_auth_id,${literal(process.env.HR_INITIAL_ADMIN_NAME || "HR 관리자")},${literal(process.env.HR_INITIAL_ADMIN_START_DATE || "2020-01-01")}::date,${literal(process.env.HR_ORGANIZATION_NAME || "HR & Work Dashboard")});
END $hr_install$;
NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verify: one active administrator; this does not display email addresses or authentication IDs.
SELECT name, role, active FROM hr.employees WHERE role='admin';
`;
  await mkdir("tmp", { recursive: true });
  const output = resolve("tmp/hr-install.sql");
  await writeFile(output, sql, "utf8");
  console.log(`통합 HR 설치 SQL을 생성했습니다: ${output}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "설치 파일 생성 실패"); process.exitCode = 1; });
