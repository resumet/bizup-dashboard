import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !secret || !anon) throw new Error("Supabase 환경변수를 설정해 주세요.");
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const demo = process.argv.includes("--demo");
  let email = process.env.HR_INITIAL_ADMIN_EMAIL;
  let authId: string | undefined;
  if (demo) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)) throw new Error("가상 데이터 생성은 로컬 Supabase에서만 허용됩니다.");
    const password = process.env.HR_DEMO_PASSWORD;
    if (!password || password.length < 12) throw new Error("HR_DEMO_PASSWORD를 12자 이상으로 설정해 주세요.");
    email = "hr-admin@example.test";
    const result = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (result.error) throw new Error("개발용 관리자 생성 실패. 기존 계정과 초기 설정 여부를 확인해 주세요.");
    authId = result.data.user.id;
  } else {
    if (!email) throw new Error("기존 인증 계정의 HR_INITIAL_ADMIN_EMAIL을 설정해 주세요.");
    for (let page = 1; ; page++) {
      const users = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (users.error) throw new Error("인증 계정 목록을 조회하지 못했습니다.");
      authId = users.data.users.find(user => user.email?.toLowerCase() === email!.toLowerCase())?.id;
      if (authId || users.data.users.length < 100) break;
    }
  }
  if (!authId) throw new Error("초기 관리자의 인증 계정이 없습니다. 먼저 기존 로그인 계정을 생성해 주세요.");
  const bootstrap = await admin.rpc("hr_bootstrap", { p_auth_id: authId, p_name: process.env.HR_INITIAL_ADMIN_NAME || "HR 관리자", p_start_date: process.env.HR_INITIAL_ADMIN_START_DATE || "2020-01-01", p_organization_name: process.env.HR_ORGANIZATION_NAME || "HR & Work Dashboard" });
  if (bootstrap.error) throw new Error(`HR 초기화 실패: ${bootstrap.error.code}. 마이그레이션과 기존 초기화 여부를 확인해 주세요.`);
  if (demo) {
    const client = createClient(url, anon, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email: email!, password: process.env.HR_DEMO_PASSWORD! });
    if (login.error) throw new Error("개발용 관리자 로그인 실패");
    for (let i = 1; i <= 3; i++) {
      const address = `hr-employee-${i}@example.test`;
      const created = await admin.auth.admin.createUser({ email: address, password: process.env.HR_DEMO_PASSWORD, email_confirm: true });
      if (created.error) throw new Error(`개발 직원 ${i} 인증 계정 생성 실패`);
      const reserve = await client.rpc("hr_command", { p_action: "invitation.reserve", p_key: crypto.randomUUID(), p_body: { email: address, name: `개발 직원 ${i}`, department: i === 3 ? "기획" : "운영", role: "employee", employment_start_date: "2020-01-01" } });
      if (reserve.error) throw new Error(`개발 직원 ${i} 초대 기록 생성 실패`);
      const finished = await admin.rpc("hr_finish_invitation", { p_id: reserve.data.id, p_auth_id: created.data.user.id, p_success: true });
      if (finished.error) throw new Error(`개발 직원 ${i} 등록 실패`);
      const task = await client.rpc("hr_command", { p_action: "task.create", p_key: crypto.randomUUID(), p_body: { title: `개발 업무 ${i}`, description: "가상 데이터입니다. 업무 상세에서 상태·댓글·이관을 확인해 보세요.", assignee_id: finished.data.id } });
      if (task.error) throw new Error(`개발 업무 ${i} 생성 실패`);
    }
  }
  console.log(demo ? "가상 관리자 1명·직원 3명과 업무를 생성했습니다. 이메일은 발송하지 않았습니다." : "HR 초기 관리자 설정이 완료되었습니다.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "HR 설정 실패"); process.exitCode = 1; });
