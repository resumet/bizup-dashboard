import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneSalesContacts } from "@/lib/phone-sales/jobs";

export const runtime = "nodejs";

type SavePayload = {
  instructorName?: unknown;
  freeFilenames?: unknown;
  paidFilenames?: unknown;
  freeCount?: unknown;
  paidCount?: unknown;
  excludedCount?: unknown;
  contacts?: unknown;
};

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

async function workspaceIdForUser(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.workspace_id as string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const workspaceId = await workspaceIdForUser(user.id);
  if (!workspaceId) {
    return Response.json(
      { message: "워크스페이스 권한이 없습니다." },
      { status: 403 },
    );
  }

  const payload = (await request.json()) as SavePayload;
  const instructorName = String(payload.instructorName ?? "").trim();
  const contacts = normalizePhoneSalesContacts(payload.contacts);
  if (!instructorName) {
    return Response.json({ message: "강사명을 입력해 주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("phone_sales_jobs")
    .insert({
      workspace_id: workspaceId,
      instructor_name: instructorName,
      free_filenames: stringArray(payload.freeFilenames),
      paid_filenames: stringArray(payload.paidFilenames),
      free_count: numberValue(payload.freeCount),
      paid_count: numberValue(payload.paidCount),
      excluded_count: numberValue(payload.excludedCount),
      result_count: contacts.length,
      contacts,
      created_by: user.id,
    })
    .select("id,created_at")
    .single();

  if (error) {
    return Response.json(
      {
        message:
          error.code === "PGRST205" || error.code === "42P01"
            ? "전화세일즈 작업 DB 마이그레이션을 먼저 적용해 주세요."
            : error.message,
      },
      { status: 400 },
    );
  }

  return Response.json(data, { status: 201 });
}
