import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { paidExclusionRostersQuery, paidExclusionRosterOption } from "@/lib/address-books/paid-rosters";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { comparePaidStudents } from "@/lib/course-operations/compare-paid-students";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const inputSchema = z.object({ leftId: z.uuid(), rightId: z.uuid() })
  .refine(input => input.leftId !== input.rightId);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

class ComparisonError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function authorize() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) throw new ComparisonError("로그인이 필요합니다.", 401);
  const membership = await requireCourseOperationsMembership(user.id).catch(() => null);
  if (!membership) throw new ComparisonError("워크스페이스 권한이 없습니다.", 403);
  return { admin: createAdminClient(), workspaceId: membership.workspace_id };
}

function failure(error: unknown) {
  return error instanceof ComparisonError ? json({ message: error.message }, error.status)
    : json({ message: "수강생 비교 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500);
}

export async function GET() {
  try {
    const { admin, workspaceId } = await authorize();
    const { data, error } = await paidExclusionRostersQuery(admin, workspaceId).order("updated_at", { ascending: false });
    if (error) throw error;
    return json({ rosters: (data ?? []).map(paidExclusionRosterOption) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { admin, workspaceId } = await authorize();
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ message: "서로 다른 유료수강생 명단 두 개를 선택해 주세요." }, 400);
    const results = await Promise.all([parsed.data.leftId, parsed.data.rightId].map(id =>
      paidExclusionRostersQuery(admin, workspaceId, id).maybeSingle()));
    if (results.some(result => result.error)) throw new ComparisonError("명단을 조회하지 못했습니다. 다시 시도해 주세요.", 500);
    const [left, right] = results.map(result => result.data);
    if (!left || !right) throw new ComparisonError("선택한 유료수강생 명단을 찾을 수 없습니다. 팝업을 다시 열어 목록을 확인해 주세요.", 404);
    const [leftRows, rightRows] = await Promise.all([left, right].map(roster =>
      loadJobEnrollmentRows(admin, roster.id, roster.latest_version)));
    return json({
      ...comparePaidStudents(leftRows, rightRows),
      leftRoster: paidExclusionRosterOption(left), rightRoster: paidExclusionRosterOption(right),
    });
  } catch (error) { return failure(error); }
}
