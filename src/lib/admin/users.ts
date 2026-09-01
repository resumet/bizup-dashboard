import "server-only";

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

type MembershipRow = {
  created_at: string;
  role: string;
  user_id: string;
  workspace_id: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
};

export type AdminUserRow = {
  createdAt: string;
  email: string;
  emailConfirmedAt: string | null;
  id: string;
  lastSignInAt: string | null;
  providers: string[];
  workspaces: Array<{
    joinedAt: string;
    name: string;
    role: string;
  }>;
};

const AUTH_PAGE_SIZE = 1000;

async function listAllAuthUsers() {
  const admin = createAdminClient();
  const users: User[] = [];

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: AUTH_PAGE_SIZE,
    });

    if (error) throw new Error(`Supabase 계정 조회 실패: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < AUTH_PAGE_SIZE) break;
  }

  return users;
}

function getProviders(user: User) {
  const providers = user.app_metadata.providers;
  if (Array.isArray(providers)) {
    return providers.filter(
      (provider): provider is string => typeof provider === "string",
    );
  }

  const provider = user.app_metadata.provider;
  return typeof provider === "string" ? [provider] : [];
}

export async function loadAdminUsers(): Promise<AdminUserRow[]> {
  const admin = createAdminClient();
  const [users, membershipResult, workspaceResult] = await Promise.all([
    listAllAuthUsers(),
    admin
      .from("workspace_members")
      .select("user_id, workspace_id, role, created_at")
      .limit(10000),
    admin.from("workspaces").select("id, name").limit(10000),
  ]);

  if (membershipResult.error) {
    throw new Error(
      `워크스페이스 권한 조회 실패: ${membershipResult.error.message}`,
    );
  }
  if (workspaceResult.error) {
    throw new Error(
      `워크스페이스 조회 실패: ${workspaceResult.error.message}`,
    );
  }

  const workspaceNames = new Map(
    (workspaceResult.data as WorkspaceRow[]).map((workspace) => [
      workspace.id,
      workspace.name,
    ]),
  );
  const membershipsByUser = new Map<string, MembershipRow[]>();

  for (const membership of membershipResult.data as MembershipRow[]) {
    const memberships = membershipsByUser.get(membership.user_id) ?? [];
    memberships.push(membership);
    membershipsByUser.set(membership.user_id, memberships);
  }

  return users.map((user) => ({
    createdAt: user.created_at,
    email: user.email ?? "이메일 없음",
    emailConfirmedAt: user.email_confirmed_at ?? null,
    id: user.id,
    lastSignInAt: user.last_sign_in_at ?? null,
    providers: getProviders(user),
    workspaces: (membershipsByUser.get(user.id) ?? []).map((membership) => ({
      joinedAt: membership.created_at,
      name:
        workspaceNames.get(membership.workspace_id) ?? "삭제된 워크스페이스",
      role: membership.role,
    })),
  }));
}
