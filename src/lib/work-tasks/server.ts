import "server-only";

import type { User } from "@supabase/supabase-js";

import { hasAdminAccess, isSuperAdminEmail } from "@/lib/admin/access";
import { resolveUserDisplayNames } from "@/lib/admin/user-names";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { WorkTaskPerson } from "./types";

export async function requireWorkTaskContext() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) throw new Error("UNAUTHORIZED");
  const membership = await requireCourseOperationsMembership(user.id);
  const admin = createAdminClient();
  const access = await admin.rpc("personnel_access", { p_workspace_id: membership.workspace_id, p_user_id: user.id });
  if (access.error) throw new Error("임직원 접근 권한을 확인하지 못했습니다.");
  if (!access.data) throw new Error("PERSONNEL_INACTIVE");
  return {
    admin,
    user,
    workspaceId: membership.workspace_id,
    isSuperAdmin:
      isSuperAdminEmail(user.email) || membership.role === "super_admin",
    isAdmin: hasAdminAccess(user.email, membership.role),
    today: koreaDate(),
  };
}

export async function loadWorkspacePeople(workspaceId: string) {
  const admin = createAdminClient();
  const { data: memberships, error } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .limit(1000);
  if (error) throw new Error(`직원 목록 조회 실패: ${error.message}`);

  const wanted = new Set((memberships ?? []).map((item) => item.user_id));
  const accounts: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error: userError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (userError) throw new Error(`직원 계정 조회 실패: ${userError.message}`);
    for (const account of data.users) {
      if (!wanted.has(account.id)) continue;
      accounts.push(account);
    }
    if (data.users.length < 1000) break;
  }
  const displayNames = resolveUserDisplayNames(accounts.map((account) => ({
    id: account.id,
    email: account.email,
    createdAt: account.created_at,
    metadata: account.user_metadata as Record<string, unknown>,
  })));
  const now = Date.now();
  const personnel = await admin.rpc("personnel_directory", { p_workspace_id: workspaceId });
  if (personnel.error) throw new Error("직원 재직 상태를 확인하지 못했습니다.");
  const profiles = new Map<string, { name: string; active: boolean }>((personnel.data ?? []).map((row: { user_id: string; name: string; active: boolean }) => [row.user_id, row]));
  const people: WorkTaskPerson[] = accounts.map((account) => ({
    id: account.id,
    name: profiles.get(account.id)?.name ?? displayNames.get(account.id) ?? "사용자",
    active: profiles.get(account.id)?.active !== false && Boolean(account.email_confirmed_at) && (!account.banned_until || new Date(account.banned_until).getTime() <= now),
  }));
  return people.sort((left, right) => left.name.localeCompare(right.name, "ko"));
}

export function koreaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
