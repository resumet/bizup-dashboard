export const SUPER_ADMIN_EMAIL = "resumet@gmail.com";

export type AccountRole = "super_admin" | "admin" | "user";
export type EditableAccountRole = AccountRole;

export function isSuperAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function hasAdminAccess(
  email: string | null | undefined,
  workspaceRole: string | null | undefined,
) {
  return (
    isSuperAdminEmail(email) ||
    workspaceRole === "super_admin" ||
    workspaceRole === "admin"
  );
}

export function getAccountRole(
  email: string | null | undefined,
  workspaceRoles: readonly string[],
): AccountRole {
  if (isSuperAdminEmail(email)) return "super_admin";
  if (workspaceRoles.some((role) => role === "super_admin")) {
    return "super_admin";
  }
  return workspaceRoles.some((role) => role === "admin") ? "admin" : "user";
}

export function toWorkspaceRole(role: EditableAccountRole) {
  return role;
}
