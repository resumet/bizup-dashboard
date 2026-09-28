import { isSuperAdminEmail } from "./access";

type AccountStatus = { app_metadata?: Record<string, unknown>; banned_until?: string | null };
export function isAccountDisabled(account: AccountStatus, now = Date.now()) {
  return account.app_metadata?.account_disabled === true || Boolean(account.banned_until && new Date(account.banned_until).getTime() > now);
}
export function requireAccountStatusChange(actorId: string, target: { id: string; email?: string }, active: unknown): boolean {
  if (typeof active !== "boolean") throw new Error("계정 활성 상태를 확인해 주세요.");
  if (actorId === target.id || isSuperAdminEmail(target.email)) throw new Error("본인 또는 최고관리자 계정의 활성 상태는 변경할 수 없습니다.");
  return active;
}
