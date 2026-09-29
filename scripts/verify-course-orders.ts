import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase 서버 환경변수가 필요합니다.");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const results = await Promise.all([
    admin.from("course_orders").select("id,course_id,record_key,product_name,option_name,member_name,phone,email,payment_amount,refund_amount,current_amount,status,payment_method,rs,ad_media,inflow_type,payment_id,order_id,refund_date,import_id,updated_at").limit(0),
    admin.from("course_order_imports").select("id,course_id,file_name,row_count,created_by,created_at").limit(0),
  ]);
  const errors = results.flatMap((result, index) => result.error ? [{ table: index === 0 ? "course_orders" : "course_order_imports", code: result.error.code }] : []);
  console.log(JSON.stringify({ available: !errors.length, errors }));
  if (errors.length) {
    throw new Error("주문 DB 구조가 필요합니다. docs/database-migrations.md의 절차로 연결 프로젝트와 supabase db push --dry-run 결과를 확인해 주세요. 과거 SQL이나 운영 기준 파일을 다시 실행하지 마세요.");
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "검증 실패"); process.exitCode = 1; });
