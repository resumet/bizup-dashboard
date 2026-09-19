import "server-only";

import type { User } from "@supabase/supabase-js";

import { isSuperAdminEmail } from "@/lib/admin/access";
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
  return {
    admin: createAdminClient(),
    user,
    workspaceId: membership.workspace_id,
    isSuperAdmin:
      isSuperAdminEmail(user.email) || membership.role === "super_admin",
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
  const people: WorkTaskPerson[] = accounts.map((account) => ({
    id: account.id,
    name: displayNames.get(account.id) ?? "사용자",
    active: Boolean(account.email_confirmed_at) && (!account.banned_until || new Date(account.banned_until).getTime() <= now),
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
