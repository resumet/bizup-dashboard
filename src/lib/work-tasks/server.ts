import "server-only";

import { hasAdminAccess } from "@/lib/admin/access";
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
    isAdmin: hasAdminAccess(user.email, membership.role),
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
  const people: WorkTaskPerson[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error: userError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (userError) throw new Error(`직원 계정 조회 실패: ${userError.message}`);
    for (const account of data.users) {
      if (!wanted.has(account.id)) continue;
      const metadata = account.user_metadata as Record<string, unknown>;
      const name = typeof metadata.full_name === "string" && metadata.full_name.trim()
        ? metadata.full_name.trim()
        : account.email ?? "이름 없음";
      people.push({ id: account.id, email: account.email ?? "", name });
    }
    if (data.users.length < 1000) break;
  }
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
