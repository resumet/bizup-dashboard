import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneSalesContacts } from "@/lib/phone-sales/jobs";

export const runtime = "nodejs";

type Context = {
  params: Promise<{ jobId: string }>;
};

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

export async function PATCH(request: Request, { params }: Context) {
  const { jobId } = await params;
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
    .update({
      instructor_name: instructorName,
      free_filenames: stringArray(payload.freeFilenames),
      paid_filenames: stringArray(payload.paidFilenames),
      free_count: numberValue(payload.freeCount),
      paid_count: numberValue(payload.paidCount),
      excluded_count: numberValue(payload.excludedCount),
      result_count: contacts.length,
      contacts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("workspace_id", workspaceId)
    .select("id,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return Response.json({ message: error.message }, { status: 400 });
  }
  if (!data) {
    return Response.json(
      { message: "전화세일즈 작업을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  return Response.json(data);
}

export async function DELETE(_request: Request, { params }: Context) {
  const { jobId } = await params;
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

  const admin = createAdminClient();
  const { error } = await admin
    .from("phone_sales_jobs")
    .delete()
    .eq("id", jobId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return Response.json({ message: error.message }, { status: 400 });
  }

  return Response.json({ message: "전화세일즈 작업을 삭제했습니다." });
}
