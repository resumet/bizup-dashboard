import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { databaseError, HrError } from "./server";

export async function reconcileHrInvitation(id: string) {
  const result = await createAdminClient().rpc("hr_reconcile_invitation", { p_id: id });
  if (result.error) throw databaseError(result.error);
}

export async function deliverHrInvitation(id: string) {
  const origin = process.env.HR_APP_URL?.trim() || "https://bizup-dashboard.vercel.app";
  if (!origin || !/^https?:\/\//.test(origin)) throw new HrError("직원 초대를 위한 서비스 주소 설정이 필요합니다.", 503);
  const redirectTo = new URL("/hr-invite", origin).toString();
  const admin = createAdminClient();
  const claim = await admin.rpc("hr_claim_invitation", { p_id: id });
  if (claim.error) throw databaseError(claim.error);
  if (!claim.data.claimed) {
    if (claim.data.status === "sent") return;
    throw new HrError("초대 처리 상태를 확인해야 합니다. 중복 메일을 보내지 않도록 관리자가 초대 기록을 확인해 주세요.", 409);
  }
  let authId: string | undefined = claim.data.existing_auth_id ?? undefined;
  try {
    // Existing dashboard accounts receive a sign-in invitation instead of a duplicate auth account.
    const result = authId
      ? await admin.auth.signInWithOtp({ email: claim.data.email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
      : await admin.auth.admin.inviteUserByEmail(claim.data.email, { redirectTo });
    if (result.error) {
      if (result.error.status && result.error.status < 500) await admin.rpc("hr_finish_invitation", { p_id: id, p_auth_id: null, p_success: false });
      throw new HrError("초대 메일 전송을 확인하지 못했습니다. 관리자 화면의 초대 상태를 확인해 주세요.", 502);
    }
    authId ??= result.data.user?.id;
    if (!authId) throw new HrError("초대 계정 확인이 필요합니다.", 502);
    const finished = await admin.rpc("hr_finish_invitation", { p_id: id, p_auth_id: authId, p_success: true });
    if (finished.error) throw databaseError(finished.error);
  } catch (error) {
    if (error instanceof HrError) throw error;
    throw new HrError("초대 요청 결과를 확인하지 못했습니다. 초대 기록 확인 후 다시 진행해 주세요.", 502);
  }
}
