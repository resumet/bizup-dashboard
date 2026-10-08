import type { Metadata } from "next";

import { InviteCallback } from "@/components/auth/invite-callback";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "초대 확인 | BizUp", robots: { index: false, follow: false }, referrer: "no-referrer" };

// Public bootstrap: fragment credentials are not sent to the server. The actual
// password page still requires fresh server-side authentication.
export default function InviteCallbackPage() {
  return <main className="grid min-h-screen place-items-center px-5 py-12"><InviteCallback /></main>;
}
