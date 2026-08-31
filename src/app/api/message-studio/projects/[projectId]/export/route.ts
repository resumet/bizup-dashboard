import { buildMessageStudioXlsx } from "@/lib/message-studio/export-xlsx";
import {
  apiError,
  requireMessageStudioProject,
} from "@/lib/message-studio/server";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ projectId: string }> };

export const runtime = "nodejs";

export async function GET(_: Request, { params }: Context) {
  const { projectId } = await params;
  const supabase = await createClient();
  try {
    const { project, resources } = await requireMessageStudioProject(
      supabase,
      projectId,
    );
    const buffer = await buildMessageStudioXlsx(project, resources);
    const safeName = project.course_name.replace(/[\\/:*?"<>|]/g, "_");
    const filename = `${safeName}_문자30개.xlsx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
