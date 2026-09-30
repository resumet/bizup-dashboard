import { cookies } from "next/headers";

import { courseDocumentErrorResponse, createUnlockToken, unlockCookieName } from "@/lib/course-documents/server";
import { assertValidKoreanPhone, leadSubmissionSchema } from "@/lib/course-documents/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
type Context = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const { slug } = await params;
    const input = leadSubmissionSchema.parse(await request.json());
    const phoneNormalized = assertValidKoreanPhone(input.phone);
    const admin = createAdminClient();
    const { data: document, error: documentError } = await admin.from("course_documents").select("id,workspace_id,course_id,instructor_name,status,lead_gate_enabled").eq("slug", slug).is("deleted_at", null).maybeSingle();
    if (documentError) throw new Error(`공개 문서 조회 실패: ${documentError.code}`);
    if (!document || document.status !== "published") throw new Error("NOT_FOUND");
    if (!document.lead_gate_enabled) throw new Error("이 문서는 정보 입력이 필요하지 않습니다.");

    const { data: blocked, error: blockedError } = await admin.from("course_document_blocked_phones").select("id").eq("workspace_id", document.workspace_id).eq("phone_normalized", phoneNormalized).maybeSingle();
    if (blockedError) throw new Error(`차단 전화번호 확인 실패: ${blockedError.code}`);
    if (blocked) return Response.json({ message: "등록할 수 없는 전화번호입니다." }, { status: 400 });

    const { error: insertError } = await admin.from("course_document_leads").upsert({
      workspace_id: document.workspace_id,
      document_id: document.id,
      course_id: document.course_id,
      instructor_name: document.instructor_name,
      name: input.name,
      phone: input.phone,
      phone_normalized: phoneNormalized,
      utm_source: input.utmSource || null,
      utm_medium: input.utmMedium || null,
      utm_campaign: input.utmCampaign || null,
      utm_content: input.utmContent || null,
      referrer: input.referrer || null,
    }, { onConflict: "document_id,phone_normalized", ignoreDuplicates: true });
    if (insertError) throw new Error(`리드 저장 실패: ${insertError.code}`);

    const cookieStore = await cookies();
    cookieStore.set(unlockCookieName(document.id), createUnlockToken(document.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: `/article/${slug}`,
    });
    return Response.json({ success: true });
  } catch (error) {
    return courseDocumentErrorResponse(error);
  }
}
