import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (user) redirect("/");

  return <main className="grid min-h-screen place-items-center px-5 py-12"><LoginForm /></main>;
}
