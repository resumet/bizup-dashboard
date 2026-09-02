import { syncMessageDeliveryResults } from "@/lib/messages/delivery-sync";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Context = {
  params: Promise<{ jobId: string; messageId: string }>;
};

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_: Request, { params }: Context) {
  const { jobId, messageId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: message } = await supabase
    .from("message_jobs")
    .select("id,provider")
    .eq("id", messageId)
    .eq("course_job_id", jobId)
    .maybeSingle();
  if (!message) {
    return Response.json(
      { message: "발송 이력을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (message.provider !== "directalk") {
    return Response.json({ skipped: true, provider: message.provider });
  }

  try {
    return Response.json(
      await syncMessageDeliveryResults("roster", message.id),
    );
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "실제 발송 결과 조회에 실패했습니다.",
      },
      { status: 502 },
    );
  }
}
