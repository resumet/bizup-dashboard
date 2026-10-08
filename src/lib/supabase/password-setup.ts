import type { SupabaseClient } from "@supabase/supabase-js";

import { isAccountDisabled } from "@/lib/admin/account-status";

export const DEFAULT_PASSWORD_MIN_LENGTH = 6;

export function validateNewPassword(password: string, confirmation: string, minimumLength: number) {
  if (password.length < minimumLength) return `비밀번호를 ${minimumLength}자 이상 입력해 주세요.`;
  if (password !== confirmation) return "비밀번호와 비밀번호 확인이 일치하지 않습니다.";
  return null;
}

export function passwordSetupError(error: { code?: string; status?: number; message?: string }) {
  switch (error.code) {
    case "weak_password":
      return "비밀번호가 보안 정책에 맞지 않습니다. 더 긴 비밀번호에 영문 대·소문자, 숫자, 특수문자를 포함하고 다른 곳에서 사용한 비밀번호는 피해주세요.";
    case "same_password":
      return "기존 비밀번호와 다른 비밀번호를 입력해 주세요.";
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
    case "user_not_found":
    case "user_banned":
      return "인증 세션이 만료되었거나 계정을 사용할 수 없습니다. 관리자에게 새 초대를 요청하거나 다시 로그인해 주세요.";
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return "인증 시간이 만료되었습니다. 새 초대 링크로 인증하거나 다시 로그인한 뒤 시도해 주세요.";
    case "over_request_rate_limit":
      return "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error.status === 401 || error.status === 403) {
    return "인증을 다시 확인해야 합니다. 새 초대 링크로 인증하거나 다시 로그인해 주세요.";
  }
  return "비밀번호를 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요. 계속 실패하면 관리자에게 문의해 주세요.";
}

type PasswordAuthClient = { auth: Pick<SupabaseClient["auth"], "getUser" | "updateUser"> };

export async function saveAccountPassword(
  supabase: PasswordAuthClient,
  expectedUserId: string,
  password: string,
  confirmation: string,
  minimumLength = DEFAULT_PASSWORD_MIN_LENGTH,
): Promise<string | null> {
  const validation = validateNewPassword(password, confirmation, minimumLength);
  if (validation) return validation;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return "인증 세션을 확인할 수 없습니다. 초대 링크를 다시 열거나 다시 로그인해 주세요.";
    }
    if (data.user.id !== expectedUserId) {
      return "로그인한 계정이 변경되었습니다. 이 페이지를 새로고침하고 계정을 확인해 주세요.";
    }
    if (isAccountDisabled(data.user)) return "사용할 수 없는 계정입니다. 관리자에게 문의해 주세요.";

    const result = await supabase.auth.updateUser({ password });
    if (result.error) return passwordSetupError(result.error);
    if (!result.data.user || result.data.user.id !== expectedUserId) {
      return "계정 정보를 확인하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.";
    }
    return null;
  } catch {
    return "서버에 연결하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
  }
}
