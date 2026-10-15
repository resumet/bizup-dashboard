import "server-only";
import { cache } from "react";
import { COURSE_BANNER_BUCKET } from "@/lib/course-operations/banner";
import { createAdminClient } from "@/lib/supabase/admin";

export const getPublishedCourseDocument = cache(async (slug: string) => {
  const admin = createAdminClient();
  const { data, error } = await admin.from("course_documents")
    .select("id,course_id,instructor_name,title,slug,content,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at,courses!inner(name,instructor_name,banner_image_path,updated_at)")
    .eq("slug", slug).eq("status", "published").is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`공개 문서 조회 실패: ${error.code}`);
  if (!data) return null;
  const course = Array.isArray(data.courses) ? data.courses[0] : data.courses;
  if (!course) return null;
  return { admin, data, course };
});

export function unavailableShareImage() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function courseShareImage(admin: ReturnType<typeof createAdminClient>, bannerPath: string | null) {
  if (!bannerPath) return unavailableShareImage();
  const { data, error } = await admin.storage.from(COURSE_BANNER_BUCKET).download(bannerPath);
  if (error || !data) return unavailableShareImage();
  const extension = bannerPath.split(".").pop()?.toLowerCase();
  const mime = data.type || ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string, string>)[extension ?? ""];
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return unavailableShareImage();
  return new Response(await data.arrayBuffer(), {
    headers: { "Content-Type": mime, "Content-Disposition": "inline", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" },
  });
}
