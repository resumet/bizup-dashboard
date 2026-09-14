import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
loadEnvConfig(process.cwd());
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase 환경변수가 없습니다.");
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error} = await client.rpc("hr_query",{p_resource:"context",p_filter:{}});
  if (error?.code === "PGRST202") console.log("HR_MIGRATIONS_NOT_APPLIED");
  else if (error?.code === "42501" || error?.code === "PT401") console.log("HR_RPC_PRESENT_AND_UNAUTHENTICATED_ACCESS_DENIED");
  else if (error) { console.log("HR_INSTALL_CHECK_INCONCLUSIVE",error.code || "NETWORK"); process.exitCode=1; }
  else throw new Error("인증 없는 HR 접근이 허용됩니다. 권한 정책을 확인해 주세요.");
  if (process.argv.includes("--admin") && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.HR_INITIAL_ADMIN_EMAIL) {
    const admin = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    let found = false;
    for (let page = 1; ; page++) {
      const result = await admin.auth.admin.listUsers({page,perPage:100});
      if (result.error) throw new Error("인증 계정 확인 실패");
      found = result.data.users.some(user => user.email?.toLowerCase() === process.env.HR_INITIAL_ADMIN_EMAIL?.toLowerCase());
      if (found || result.data.users.length < 100) break;
    }
    console.log(found ? "HR_INITIAL_ADMIN_AUTH_ACCOUNT_FOUND" : "HR_INITIAL_ADMIN_AUTH_ACCOUNT_MISSING");
  }
}
main().catch(()=>{console.error("HR 설치 상태 확인 실패. 네트워크 또는 설정을 확인해 주세요.");process.exitCode=1;});
