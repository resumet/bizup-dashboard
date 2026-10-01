import { NextResponse } from "next/server";
import { start } from "workflow/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { DEFAULT_YOUTUBE_EMAIL_SETTINGS, inputs, normalizeAppearanceFee, normalizeChannelCategory, normalizeChannelEmail, normalizeChannelMemo, normalizeExcludedFromUpdates, normalizeRsPercent } from "@/lib/youtube-analyzer/model";
import { setting } from "@/lib/youtube-analyzer/api";
import { youtubeAnalysisWorkflow } from "@/workflows/youtube-analysis";

export const maxDuration = 120;
const pageSize = 200;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function missingOptionalColumn(error: {code?: string} | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

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

async function storedChannelUrls(admin: SupabaseClient, workspaceId: string) {
  const urls: string[] = [];
  let afterPosition: number | string | undefined;
  while (true) {
    let query = admin.from("youtube_analyzed_channels")
      .select("position,channel_id")
      .eq("workspace_id",workspaceId)
      .eq("excluded_from_updates",false)
      .order("position")
      .limit(pageSize);
    if (afterPosition !== undefined) query = query.gt("position",afterPosition);
    let {data,error} = await query;
    if (missingOptionalColumn(error)) {
      let fallback = admin.from("youtube_analyzed_channels")
        .select("position,channel_id")
        .eq("workspace_id",workspaceId)
        .order("position")
        .limit(pageSize);
      if (afterPosition !== undefined) fallback = fallback.gt("position",afterPosition);
      const legacy = await fallback;
      data = legacy.data;
      error = legacy.error;
    }
    if (error) throw error;
    const page = data ?? [];
    urls.push(...page.map(row=>`https://www.youtube.com/channel/${row.channel_id}`));
    if (page.length < pageSize) break;
    afterPosition = page[page.length-1].position;
  }
  return urls;
}

async function batchRequests(admin: SupabaseClient, batchId: string) {
  const requests: Record<string,unknown>[] = [];
  for (let offset=0;;offset+=pageSize) {
    const {data,error} = await admin.from("youtube_analysis_requests")
      .select("id,input_url,status,error_code,resolved_channel_id")
      .eq("batch_id",batchId)
      .order("input_order")
      .range(offset,offset+pageSize-1);
    if (error) throw error;
    requests.push(...data);
    if (data.length < pageSize) break;
  }
  return requests;
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
      .select("position,channel_id,channel,email,category,appearance_fee,rs_percent,memo,excluded_from_updates,metrics,warnings,first_analyzed_at,last_analyzed_at")
      .eq("workspace_id",workspaceId)
      .order("position")
      .range(offset,offset+200);
    const batchQuery = batchId
      ? admin.from("youtube_analysis_batches").select("*").eq("id",batchId).eq("workspace_id",workspaceId).maybeSingle()
      : Promise.resolve({data:null,error:null});
    const requestsQuery = batchId
      ? batchRequests(admin,batchId).then(data=>({data,error:null}))
      : Promise.resolve({data:[],error:null});
    const emailSettingsQuery = admin.from("youtube_channel_email_settings")
      .select("email_body,signature_mode,custom_signature")
      .eq("workspace_id",workspaceId)
      .maybeSingle();
    const [result,batch,requests,emailSettingsResult] = await Promise.all([channelsQuery,batchQuery,requestsQuery,emailSettingsQuery]);
    if (batch.error || requests.error) throw batch.error ?? requests.error;
    if (emailSettingsResult.error && !/PGRST20[45]|42P01/u.test(emailSettingsResult.error.code ?? "")) {
      throw emailSettingsResult.error;
    }
    let rows = result.data;
    if (missingOptionalColumn(result.error)) {
      const withMemo = await admin.from("youtube_analyzed_channels")
        .select("position,channel_id,channel,email,category,appearance_fee,rs_percent,memo,metrics,warnings,first_analyzed_at,last_analyzed_at")
        .eq("workspace_id",workspaceId)
        .order("position")
        .range(offset,offset+200);
      if (!withMemo.error) {
        rows = withMemo.data.map(row=>({...row,excluded_from_updates:false}));
      } else if (missingOptionalColumn(withMemo.error)) {
        const withAttributes = await admin.from("youtube_analyzed_channels")
          .select("position,channel_id,channel,email,category,appearance_fee,rs_percent,metrics,warnings,first_analyzed_at,last_analyzed_at")
          .eq("workspace_id",workspaceId)
          .order("position")
          .range(offset,offset+200);
        if (!withAttributes.error) {
          rows = withAttributes.data.map(row=>({...row,memo:null,excluded_from_updates:false}));
        } else if (missingOptionalColumn(withAttributes.error)) {
          const withEmail = await admin.from("youtube_analyzed_channels")
            .select("position,channel_id,channel,email,metrics,warnings,first_analyzed_at,last_analyzed_at")
            .eq("workspace_id",workspaceId)
            .order("position")
            .range(offset,offset+200);
          if (missingOptionalColumn(withEmail.error)) {
            const legacy = await admin.from("youtube_analyzed_channels")
              .select("position,channel_id,channel,metrics,warnings,first_analyzed_at,last_analyzed_at")
              .eq("workspace_id",workspaceId)
              .order("position")
              .range(offset,offset+200);
            if (legacy.error) throw legacy.error;
            rows = legacy.data.map(row=>({...row,email:null,category:null,appearance_fee:null,rs_percent:null,memo:null,excluded_from_updates:false}));
          } else {
            if (withEmail.error) throw withEmail.error;
            rows = withEmail.data.map(row=>({...row,category:null,appearance_fee:null,rs_percent:null,memo:null,excluded_from_updates:false}));
          }
        } else {
          throw withAttributes.error;
        }
      } else {
        throw withMemo.error;
      }
    } else if (result.error) throw result.error;
    if (batchId && !batch.data) return NextResponse.json({error:"분석 요청을 찾을 수 없습니다."},{status:404});
    return NextResponse.json({
      runs:rows!.slice(0,200),
      hasMore:rows!.length>200,
      batch:batch.data,
      requests:requests.data,
      emailSettings:emailSettingsResult.data ?? DEFAULT_YOUTUBE_EMAIL_SETTINGS,
    });
  } catch(error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const {user,workspaceId,admin} = await context();
    if (!process.env.YOUTUBE_API_KEY?.trim()) return NextResponse.json({error:"서버에 YOUTUBE_API_KEY를 설정해 주세요."},{status:503});
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({error:"잘못된 입력입니다."},{status:400}); }
    const fields = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string,unknown> : null;
    const reanalyzeAll = fields?.reanalyzeAll === true;
    let urls: string[];
    if (reanalyzeAll) {
      if (Object.keys(fields).length !== 1) return NextResponse.json({error:"잘못된 입력입니다."},{status:400});
      urls = await storedChannelUrls(admin,workspaceId);
      if (!urls.length) return NextResponse.json({error:"재분석할 채널이 없습니다."},{status:400});
    } else {
      if (typeof fields?.urls !== "string" || fields.urls.length > 100_000) return NextResponse.json({error:"URL 입력이 올바르지 않습니다."},{status:400});
      urls = inputs(fields.urls);
      const max = setting("MAX_URLS_PER_BATCH",50,200);
      if (!urls.length || urls.length > max || urls.some(s=>s.length>2000)) return NextResponse.json({error:`URL을 1~${max}개 입력해 주세요.`},{status:400});
    }
    const {data:batch,error} = await admin.from("youtube_analysis_batches").insert({workspace_id:workspaceId,created_by:user.id,input_count:urls.length}).select("id").single();
    if(error) throw error;
    try {
      const requests: {id:string;input_url:string;input_order:number}[] = [];
      for (let offset=0;offset<urls.length;offset+=pageSize) {
        const inserted = await admin.from("youtube_analysis_requests")
          .insert(urls.slice(offset,offset+pageSize).map((input_url,index)=>({batch_id:batch.id,input_order:offset+index,input_url})))
          .select("id,input_url,input_order");
        if (inserted.error) throw inserted.error;
        requests.push(...inserted.data);
      }
      await start(youtubeAnalysisWorkflow,[batch.id,requests,setting("MAX_CONCURRENT_CHANNELS",3,5)]);
    } catch {
      await admin.from("youtube_analysis_requests").update({status:"failed",error_code:"START_ERROR"}).eq("batch_id",batch.id);
      await admin.from("youtube_analysis_batches").update({status:"failed",completed_at:new Date().toISOString()}).eq("id",batch.id);
      return NextResponse.json({error:"분석 작업을 시작하지 못했습니다. 다시 요청해 주세요."},{status:503});
    }
    return NextResponse.json({batchId:batch.id},{status:202});
  } catch(error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const {admin,workspaceId} = await context();
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({error:"잘못된 입력입니다."},{status:400}); }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({error:"잘못된 입력입니다."},{status:400});
    }
    const fields = body as Record<string,unknown>;
    const {channelId} = fields;
    if (typeof channelId !== "string" || !channelId.trim() || channelId.length > 128) {
      return NextResponse.json({error:"채널 입력이 올바르지 않습니다."},{status:400});
    }
    const updates: Record<string,string|number|boolean|null> = {};
    const includes = (key: string) => Object.prototype.hasOwnProperty.call(fields,key);
    try {
      if (includes("email")) updates.email = normalizeChannelEmail(fields.email);
      if (includes("category")) updates.category = normalizeChannelCategory(fields.category);
      if (includes("appearanceFee")) updates.appearance_fee = normalizeAppearanceFee(fields.appearanceFee);
      if (includes("rsPercent")) updates.rs_percent = normalizeRsPercent(fields.rsPercent);
      if (includes("memo")) updates.memo = normalizeChannelMemo(fields.memo);
      if (includes("excludedFromUpdates")) updates.excluded_from_updates = normalizeExcludedFromUpdates(fields.excludedFromUpdates);
    } catch(error) {
      const code = error instanceof Error ? error.message : "";
      const message = code === "INVALID_EMAIL" ? "올바른 이메일 주소를 입력해 주세요."
        : code === "INVALID_CATEGORY" ? "분류 목록에서 선택해 주세요."
        : code === "INVALID_APPEARANCE_FEE" ? "출연료는 0원 이상의 정수로 입력해 주세요."
        : code === "INVALID_MEMO" ? "메모는 2,000자 이하로 입력해 주세요."
        : code === "INVALID_EXCLUDED_FROM_UPDATES" ? "업데이트 제외 설정을 확인해 주세요."
        : "RS는 0~100 사이의 숫자로 입력해 주세요.";
      return NextResponse.json({error:message},{status:400});
    }
    if (!Object.keys(updates).length) return NextResponse.json({error:"수정할 항목을 입력해 주세요."},{status:400});
    let result = await admin.from("youtube_analyzed_channels")
      .update(updates)
      .eq("workspace_id",workspaceId)
      .eq("channel_id",channelId)
      .select("channel_id")
      .maybeSingle();
    const requestedExclusion = updates.excluded_from_updates;
    if (missingOptionalColumn(result.error) && requestedExclusion === false) {
      delete updates.excluded_from_updates;
      result = await admin.from("youtube_analyzed_channels")
        .update(updates)
        .eq("workspace_id",workspaceId)
        .eq("channel_id",channelId)
        .select("channel_id")
        .maybeSingle();
    }
    if (missingOptionalColumn(result.error)) {
      return NextResponse.json({error:"채널 정보 저장을 사용하려면 Supabase SQL 마이그레이션을 먼저 적용해 주세요."},{status:503});
    }
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({error:"분석한 채널을 찾을 수 없습니다."},{status:404});
    return NextResponse.json({channelId:result.data.channel_id,...updates,...(requestedExclusion === false ? { excluded_from_updates:false } : {})});
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
