import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SetPasswordForm } from "@/components/auth/set-password-form";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { DEFAULT_PASSWORD_MIN_LENGTH } from "@/lib/supabase/password-setup";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "비밀번호 설정 | BizUp", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SetPasswordPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/auth/invite-error?reason=session");

  const configuredLength = Number(process.env.SUPABASE_PASSWORD_MIN_LENGTH);
  const minimumLength = Number.isInteger(configuredLength) && configuredLength >= DEFAULT_PASSWORD_MIN_LENGTH
    ? configuredLength : DEFAULT_PASSWORD_MIN_LENGTH;

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <SetPasswordForm userId={user.id} email={user.email} minimumLength={minimumLength} />
    </main>
  );
}
