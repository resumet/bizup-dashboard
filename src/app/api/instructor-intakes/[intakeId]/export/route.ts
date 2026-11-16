import { zipSync } from "fflate";
import sharp from "sharp";
import { instructorIntakeExportNames, instructorIntakeMarkdown } from "@/lib/instructor-intake/export";
import { FIELD_LABELS } from "@/lib/instructor-intake/model";
import { intakeApiError, intakeMember, memberIntake } from "@/lib/instructor-intake/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Course = { name: string; instructor_name: string };

async function jpgFromStorage(path: string) {
  const { data, error } = await createAdminClient().storage.from("instructor-profile-photos").download(path);
  if (error || !data) throw error ?? new Error("업로드 이미지를 불러오지 못했습니다.");
  return sharp(Buffer.from(await data.arrayBuffer())).rotate().jpeg({ quality: 90 }).toBuffer();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ intakeId: string }> },
) {
  try {
    const { workspaceId } = await intakeMember();
    const { intakeId } = await params;
    const row = await memberIntake(workspaceId, intakeId);
    const admin = createAdminClient();
    const { data: course, error: courseError } = row.course_id
      ? await admin.from("courses").select("name,instructor_name").eq("workspace_id", workspaceId).eq("id", row.course_id).maybeSingle()
      : { data: null, error: null };
    if (courseError) throw courseError;

    const courseInfo = course as Course | null;
    const names = instructorIntakeExportNames({
      instructorName: courseInfo?.instructor_name || row.answers.realName || "강사",
      courseName: courseInfo?.name || row.title || "강의",
    });
    const files: Record<string, Uint8Array> = {
      [names.markdown]: new TextEncoder().encode(instructorIntakeMarkdown(row.answers, row.photo_paths.length, row.image_paths)),
    };
    const imageGroups = [
      { index: 4, paths: row.photo_paths, label: FIELD_LABELS[4] },
      { index: 8, paths: row.image_paths.evidence, label: FIELD_LABELS[8] },
      { index: 9, paths: row.image_paths.studentResults, label: FIELD_LABELS[9] },
      { index: 10, paths: row.image_paths.reviews, label: FIELD_LABELS[10] },
      { index: 16, paths: row.image_paths.opportunity, label: FIELD_LABELS[16] },
    ];

    await Promise.all(imageGroups.flatMap(({ index, paths, label }) => paths.map(async (path, imageIndex) => {
      const folderName = `${index + 1}. ${label}`;
      const folder = `${names.imagesFolder}/${folderName}`;
      const filename = `${folderName}-${String(imageIndex + 1).padStart(3, "0")}.jpg`;
      files[`${folder}/${filename}`] = await jpgFromStorage(path);
    })));

    const archive = zipSync(files, { level: 6 });
    return new Response(archive, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="instructor-intake.zip"; filename*=UTF-8''${encodeURIComponent(names.archive)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return intakeApiError(error);
  }
}
