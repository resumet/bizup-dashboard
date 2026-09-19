import { isSuperAdminEmail } from "./access";

export type UserNameSource = {
  id: string;
  email: string | null | undefined;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export function parseUserDisplayName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= 30 ? name : null;
}

export function requireUserDisplayName(value: unknown) {
  const name = parseUserDisplayName(value);
  if (!name) throw new Error("사용자 이름은 1~30자로 입력해 주세요.");
  return name;
}

export function resolveUserDisplayNames(users: UserNameSource[]) {
  const regularUsers = users
    .filter((user) => !isSuperAdminEmail(user.email))
    .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const numberById = new Map(regularUsers.map((user, index) => [user.id, index + 1]));

  return new Map(users.map((user) => {
    const saved = parseUserDisplayName(user.metadata.display_name);
    const fallback = isSuperAdminEmail(user.email)
      ? "최고관리자"
      : `사용자${numberById.get(user.id) ?? 1}`;
    return [user.id, saved ?? fallback];
  }));
}
