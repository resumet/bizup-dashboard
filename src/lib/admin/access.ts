export const MAIN_ADMIN_EMAIL = "resumet@gmail.com";

export function isMainAdminEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() === MAIN_ADMIN_EMAIL;
}
