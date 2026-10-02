import { NextResponse } from "next/server";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeCustomEmailSignature,
  normalizeEmailSignatureMode,
  normalizeYoutubeEmailSubject,
  normalizeYoutubeEmailBody,
} from "@/lib/youtube-analyzer/model";

function migrationMissing(error: { code?: string } | null) {
  return Boolean(error && /PGRST20[45]|42P01/u.test(error.code ?? ""));
}

export async function PATCH(request: Request) {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "잘못된 입력입니다." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "잘못된 입력입니다." }, { status: 400 });
    }

    const fields = body as Record<string, unknown>;
    let emailBody: string | null;
    let emailSubject: string | null;
    let signatureMode: "gmail_default" | "custom";
    let customSignature: string | null;
    try {
      emailSubject = normalizeYoutubeEmailSubject(fields.emailSubject);
      emailBody = normalizeYoutubeEmailBody(fields.emailBody);
      signatureMode = normalizeEmailSignatureMode(fields.signatureMode);
      customSignature = normalizeCustomEmailSignature(fields.customSignature);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message = code === "INVALID_EMAIL_SUBJECT"
        ? "이메일 제목은 500자 이하로 입력해 주세요."
        : code === "INVALID_EMAIL_BODY"
        ? "이메일 본문은 5,000자 이하로 입력해 주세요."
        : code === "INVALID_EMAIL_SIGNATURE"
          ? "직접 입력한 서명은 2,000자 이하로 입력해 주세요."
          : "서명 선택값을 확인해 주세요.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (signatureMode === "custom" && !customSignature) {
      return NextResponse.json({ error: "사용할 서명을 입력해 주세요." }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await admin
      .from("youtube_channel_email_settings")
      .upsert({
        workspace_id: membership.workspace_id,
        email_subject: emailSubject,
        email_body: emailBody,
        signature_mode: signatureMode,
        custom_signature: signatureMode === "custom" ? customSignature : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id" })
      .select("email_subject,email_body,signature_mode,custom_signature")
      .single();

    if (migrationMissing(result.error)) {
      return NextResponse.json(
        { error: "이메일 양식 저장 기능을 사용하려면 Supabase SQL 마이그레이션을 먼저 적용해 주세요." },
        { status: 503 },
      );
    }
    if (result.error) throw result.error;
    return NextResponse.json(result.data);
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
    console.error("[youtube-email-settings] request failed", {
      code: unauthorized ? "UNAUTHORIZED" : "DATABASE_ERROR",
    });
    return NextResponse.json(
      { error: unauthorized ? "로그인이 필요합니다." : "이메일 양식을 저장하지 못했습니다." },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
