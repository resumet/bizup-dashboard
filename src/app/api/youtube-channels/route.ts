import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { inputs } from "@/lib/youtube-analyzer/model";
import { setting } from "@/lib/youtube-analyzer/api";
import { youtubeAnalysisWorkflow } from "@/workflows/youtube-analysis";

export const maxDuration = 120;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context() {
  const user = await requireCourseOperationsUser(await createClient());
  const membership = await requireCourseOperationsMembership(user.id);
  return { user, workspaceId:membership.workspace_id, admin:createAdminClient() };
}

function failure(error: unknown) {
  const unauthorized = error instanceof Error && error.message === "UNAUTHORIZED";
  console.error("[youtube-analysis] request failed", { code: unauthorized ? "UNAUTHORIZED" : "DATABASE_ERROR" });
  return NextResponse.json(
    { error: unauthorized ? "로그인이 필요합니다." : "분석 데이터를 불러오지 못했습니다. DB 설정과 접근 권한을 확인해 주세요." },
    { status:unauthorized ? 401 : 500 },
  );
}

export async function GET(request: Request) {
  try {
    const { admin, workspaceId } = await context();
    const params = new URL(request.url).searchParams;
    const batchId = params.get("batchId");
    const channelId = params.get("channelId");
    if ((batchId && !uuid.test(batchId)) || (channelId && (channelId.length > 128 || !channelId.trim()))) {
      return NextResponse.json({ error:"잘못된 요청입니다." },{ status:400 });
    }

    if (channelId) {
      const channel = await admin.from("youtube_analyzed_channels").select("channel_id").eq("workspace_id",workspaceId).eq("channel_id",channelId).maybeSingle();
      if (channel.error) throw channel.error;
      if (!channel.data) return NextResponse.json({ error:"분석한 채널을 찾을 수 없습니다." },{status:404});
      const result = await admin.from("youtube_channel_videos").select("data").eq("workspace_id",workspaceId).eq("channel_id",channelId).order("published_at",{ascending:false}).order("video_id").limit(30);
      if (result.error) throw result.error;
      return NextResponse.json({ videos:result.data.map(row=>row.data) });
    }

    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return NextResponse.json({error:"잘못된 페이지입니다."},{status:400});

    const channelsQuery = admin.from("youtube_analyzed_channels")
      .select("position,channel_id,channel,metrics,warnings,first_analyzed_at,last_analyzed_at")
      .eq("workspace_id",workspaceId)
      .order("position")
      .range(offset,offset+200);
    const batchQuery = batchId
      ? admin.from("youtube_analysis_batches").select("*").eq("id",batchId).eq("workspace_id",workspaceId).maybeSingle()
      : Promise.resolve({data:null,error:null});
    const requestsQuery = batchId
      ? admin.from("youtube_analysis_requests").select("*").eq("batch_id",batchId).order("input_order")
      : Promise.resolve({data:[],error:null});
    const [result,batch,requests] = await Promise.all([channelsQuery,batchQuery,requestsQuery]);
    if (result.error || batch.error || requests.error) throw result.error ?? batch.error ?? requests.error;
    if (batchId && !batch.data) return NextResponse.json({error:"분석 요청을 찾을 수 없습니다."},{status:404});
    return NextResponse.json({
      runs:result.data.slice(0,200),
      hasMore:result.data.length>200,
      batch:batch.data,
      requests:requests.data,
    });
  } catch(error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const {user,workspaceId,admin} = await context();
    if (!process.env.YOUTUBE_API_KEY?.trim()) return NextResponse.json({error:"서버에 YOUTUBE_API_KEY를 설정해 주세요."},{status:503});
    let body;
    try { body = await request.json(); } catch { return NextResponse.json({error:"잘못된 입력입니다."},{status:400}); }
    if (typeof body?.urls !== "string" || body.urls.length > 100_000) return NextResponse.json({error:"URL 입력이 올바르지 않습니다."},{status:400});
    const urls = inputs(body.urls), max = setting("MAX_URLS_PER_BATCH",50,200);
    if (!urls.length || urls.length > max || urls.some(s=>s.length>2000)) return NextResponse.json({error:`URL을 1~${max}개 입력해 주세요.`},{status:400});
    const {data:batch,error} = await admin.from("youtube_analysis_batches").insert({workspace_id:workspaceId,created_by:user.id,input_count:urls.length}).select("id").single();
    if(error) throw error;
    try {
      const requests = await admin.from("youtube_analysis_requests").insert(urls.map((input_url,input_order)=>({batch_id:batch.id,input_order,input_url}))).select("id,input_url,input_order");
      if(requests.error) throw requests.error;
      await start(youtubeAnalysisWorkflow,[batch.id,requests.data.sort((a,b)=>a.input_order-b.input_order),setting("MAX_CONCURRENT_CHANNELS",3,5)]);
    } catch {
      await admin.from("youtube_analysis_requests").update({status:"failed",error_code:"START_ERROR"}).eq("batch_id",batch.id);
      await admin.from("youtube_analysis_batches").update({status:"failed",completed_at:new Date().toISOString()}).eq("id",batch.id);
      return NextResponse.json({error:"분석 작업을 시작하지 못했습니다. 다시 요청해 주세요."},{status:503});
    }
    return NextResponse.json({batchId:batch.id},{status:202});
  } catch(error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const {admin,workspaceId} = await context();
    const channelId = new URL(request.url).searchParams.get("channelId");
    if (!channelId?.trim() || channelId.length > 128) return NextResponse.json({error:"잘못된 채널입니다."},{status:400});
    const result = await admin.from("youtube_analyzed_channels")
      .delete()
      .eq("workspace_id",workspaceId)
      .eq("channel_id",channelId)
      .select("channel_id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({error:"삭제할 채널을 찾을 수 없습니다."},{status:404});
    return NextResponse.json({deleted:result.data.channel_id});
  } catch(error) { return failure(error); }
}
