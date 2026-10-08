import type { NextRequest } from "next/server";

import { confirmInvite } from "@/lib/supabase/invite-confirmation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return confirmInvite(request);
}
