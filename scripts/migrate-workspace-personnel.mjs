import nextEnv from "@next/env";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Never replay the whole history: older manual migrations have conflicting CLI versions.
const payroll = process.argv.includes("--payroll");
const version = payroll ? "202609230002" : "202609230001";
const name = payroll ? "personnel_payroll" : "workspace_personnel";
const root = process.cwd();
nextEnv.loadEnvConfig(root);
const projectRef = readFileSync(resolve(root, "supabase/.temp/project-ref"), "utf8").trim();
if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${projectRef}.supabase.co`) throw new Error("연결된 DB와 앱 환경설정이 일치하지 않습니다.");
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("npm run db:personnel 로 실행해 주세요.");
const dryRun = process.argv.includes("--dry-run");
const withBaseline = process.argv.includes("--with-missing-baseline");
if (process.argv.slice(2).some(arg => !["--dry-run", "--with-missing-baseline", "--payroll"].includes(arg))) throw new Error("지원하지 않는 실행 인자입니다.");
function query(args) {
  const result = spawnSync(process.execPath, [npmCli, "exec", "--yes", "--package=supabase@2.117.0", "--", "supabase", "db", "query", "--linked", ...args], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || "DB 명령 실행 실패");
  const output = result.stdout.slice(result.stdout.indexOf("{"));
  return JSON.parse(output).rows;
}
const sql = readFileSync(resolve(root, `supabase/migrations/${version}_${name}.sql`), "utf8");
const prior = query([`select statements from supabase_migrations.schema_migrations where version='${version}'`]);
if (prior.length) {
  if (prior[0].statements?.[0] !== sql) throw new Error("동일 버전에 다른 SQL이 적용되어 있습니다.");
  console.log("임직원 관리 마이그레이션이 이미 적용되어 있습니다.");
} else {
  const dependencies = query(["select to_regclass('public.hr_leave_profiles') is not null and to_regclass('public.work_tasks') is not null as ready"]);
  if (!dependencies[0]?.ready) throw new Error("최신 업무·휴가 DB가 먼저 필요합니다.");
  if (payroll && !query(["select to_regclass('personnel_private.employees') is not null as ready"])[0]?.ready) throw new Error("임직원 관리 초기 마이그레이션을 먼저 적용해 주세요.");
  const baseline = payroll ? [] : [
    ["202609190003_work_task_reviews_and_security", "select (to_regclass('public.work_daily_reviews') is not null)::int + (exists(select 1 from pg_policies where schemaname='public' and tablename='work_tasks' and policyname='work_tasks_member_read'))::int + (exists(select 1 from pg_policies where schemaname='public' and tablename='work_task_events' and policyname='work_task_events_member_read'))::int as installed", 3],
    ["202609190004_work_task_atomic_commands", "select count(*)::int as installed from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname in ('create_work_task_with_event','set_work_task_status_with_event','transfer_work_task_with_event')", 3],
    ["202609190005_work_task_edit_command", "select count(*)::int as installed from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname='edit_work_task_with_event'", 1],
  ];
  const pending = [];
  for (const [file, probe, expected] of baseline) {
    const installed = query([probe])[0]?.installed;
    if (installed === expected) continue;
    if (installed !== 0) throw new Error(`선행 마이그레이션이 일부만 적용되어 있습니다: ${file}`);
    if (!withBaseline) throw new Error(`누락된 선행 마이그레이션: ${file}. 검토 후 --with-missing-baseline 옵션을 사용해 주세요.`);
    const baselineVersion = file.split("_")[0];
    if (query([`select version from supabase_migrations.schema_migrations where version='${baselineVersion}'`]).length) throw new Error(`선행 마이그레이션 이력과 스키마가 다릅니다: ${file}`);
    pending.push({ version: baselineVersion, name: file.slice(baselineVersion.length + 1), sql: readFileSync(resolve(root, `supabase/migrations/${file}.sql`), "utf8") });
  }
  pending.push({ version, name, sql });
  if (dryRun) console.log(`적용 예정: ${pending.map(item => `${item.version}_${item.name}.sql`).join(", ")} (기존 마이그레이션 이력은 변경하지 않음)`);
  else {
    const tag = "$personnel_migration_source$";
    if (pending.some(item => item.sql.includes(tag))) throw new Error("SQL 구분자가 충돌합니다.");
    const folder = resolve(root, "tmp/personnel-migration");
    mkdirSync(folder, { recursive: true });
    const file = resolve(folder, "apply.sql");
    const commands = pending.map(item => `${item.sql}\ninsert into supabase_migrations.schema_migrations(version,name,statements) values('${item.version}','${item.name}',array[${tag}${item.sql}${tag}]);`).join("\n");
    writeFileSync(file, `begin;\nselect pg_advisory_xact_lock(202609230001);\n${commands}\nnotify pgrst, 'reload schema';\ncommit;\nselect true as applied;\n`);
    const rows = query(["--file", file]);
    if (!rows[0]?.applied) throw new Error("마이그레이션 완료 응답을 확인하지 못했습니다.");
    console.log(`적용 완료: ${version}_${name}.sql`);
  }
}
