import "server-only";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import type { InternalYoutubeData } from "./model";

export async function loadInternalYoutube(): Promise<InternalYoutubeData> {
  const { admin, membership } = await requireCourseDocumentMember();
  async function all(table: string, columns: string) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from(table).select(columns).eq("workspace_id", membership.workspace_id).order("id").range(offset, offset + 499);
      if (error) throw new Error("자체 유튜브 관리 정보를 불러오지 못했습니다.");
      rows.push(...data);
      if (data.length < 500) return rows;
    }
  }
  const [channels, appearances, courses] = await Promise.all([
    all("internal_youtube_channels", "id,name,manager_name,channel_url,revision"),
    all("internal_youtube_appearances", "id,course_id,channel_id,filming_date,location,original_drive_url,edited_drive_url,upload_date,published_url,revision"),
    all("courses", "id,name,instructor_name,status,free_webinar_at"),
  ]);
  const result = { channels, appearances, courses } as unknown as InternalYoutubeData;
  result.channels.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  result.courses = sortByNearestWebinar(result.courses);
  return result;
}
