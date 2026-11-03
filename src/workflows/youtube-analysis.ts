import { createAdminClient } from "@/lib/supabase/admin";
import { resolveChannel, videoPage } from "@/lib/youtube-analyzer/api";
import { calculate, errorMessages, type Channel, type Video } from "@/lib/youtube-analyzer/model";

const MAX_RECENT_VIDEOS = 50;

async function updateRequest(batchId: string, ids: string[], status: string, channelId?: string, code?: string) {
  "use step";
  const { error } = await createAdminClient().from("youtube_analysis_requests").update({ status, ...(channelId ? { resolved_channel_id: channelId } : {}), ...(code ? { error_code: code } : {}) }).eq("batch_id",batchId).in("id",ids);
  if (error) throw new Error("SAVE_ERROR");
}
async function resolve(input: string) {
  "use step";
  try { return { channel: await resolveChannel(input), code: null }; }
  catch (e) { const code = e instanceof Error && errorMessages[e.message] ? e.message : "INVALID_URL"; return { channel: null, code }; }
}
async function fetchPage(channel: Channel, token?: string) {
  "use step";
  return videoPage(channel,token);
}
async function save(batchId: string, channel: Channel, started: string, videos: Video[]) {
  "use step";
  const warnings = [];
  if (!videos.length) warnings.push("숏츠를 제외한 공개 영상이 없습니다.");
  const { error } = await createAdminClient().rpc("save_youtube_channel", { p_batch:batchId, p_channel:channel, p_metrics:calculate(videos), p_warnings:warnings, p_started:started, p_videos:videos });
  if (error) throw new Error("SAVE_ERROR");
}
async function batchState(batchId: string, count?: number, finish = false) {
  "use step";
  const admin = createAdminClient();
  let status = "running";
  if (finish) {
    const { data, error } = await admin.from("youtube_analysis_requests").select("status").eq("batch_id",batchId);
    if (error) throw new Error("SAVE_ERROR");
    status = data.every(r=>r.status === "completed") ? "completed" : data.some(r=>r.status === "completed") ? "partial" : "failed";
  }
  const { error } = await admin.from("youtube_analysis_batches").update({ ...(count === undefined ? {} : { unique_channel_count:count }), status, ...(finish ? { completed_at:new Date().toISOString() } : {}) }).eq("id",batchId);
  if (error) throw new Error("SAVE_ERROR");
}
async function stopRequested(batchId: string) {
  "use step";
  const { data, error } = await createAdminClient().from("youtube_analysis_batches").select("stop_requested").eq("id",batchId).maybeSingle();
  if (error) throw new Error("SAVE_ERROR");
  return data?.stop_requested === true;
}
async function pauseBatch(batchId: string) {
  "use step";
  const { error } = await createAdminClient().from("youtube_analysis_batches").update({ status:"paused", paused_at:new Date().toISOString() }).eq("id",batchId);
  if (error) throw new Error("SAVE_ERROR");
}
async function failBatch(batchId: string) {
  "use step";
  const admin=createAdminClient();
  const requests=await admin.from("youtube_analysis_requests").update({status:"failed",error_code:"SAVE_ERROR"}).eq("batch_id",batchId).not("status","in","(completed,failed)");
  if(requests.error) throw new Error("SAVE_ERROR");
  const result=await admin.from("youtube_analysis_batches").update({status:"failed",completed_at:new Date().toISOString()}).eq("id",batchId);
  if(result.error) throw new Error("SAVE_ERROR");
}
export async function youtubeAnalysisWorkflow(batchId: string, requests: { id:string; input_url:string }[], concurrency: number) {
  "use workflow";
  try {
  const groups = new Map<string,{ channel:Channel; ids:string[] }>();
  await batchState(batchId);
  for (const request of requests) {
    await updateRequest(batchId,[request.id],"resolving");
    const result = await resolve(request.input_url);
    if (!result.channel) { await updateRequest(batchId,[request.id],"failed",undefined,result.code!); continue; }
    const channel = result.channel;
    const group = groups.get(channel.id) ?? { channel, ids:[] };
    group.ids.push(request.id); groups.set(channel.id,group);
    await updateRequest(batchId,[request.id],"fetching_channel",channel.id);
  }
  await batchState(batchId,groups.size);
  const queue = [...groups.values()];
  for (const {channel,ids} of queue) {
      if (await stopRequested(batchId)) {
        await pauseBatch(batchId);
        return;
      }
      try {
        const started = new Date().toISOString();
        await updateRequest(batchId,ids,"fetching_videos");
        const videos = new Map<string,Video>();
        const tokens = new Set<string>();
        let token: string | undefined;
        do {
          const page = await fetchPage(channel,token);
          for (const video of page.videos) videos.set(video.id,video);
          token=page.next;
          if (token && tokens.has(token)) throw new Error("API_ERROR");
          if (token) tokens.add(token);
        } while (token && videos.size < MAX_RECENT_VIDEOS);
        await updateRequest(batchId,ids,"saving");
        const recentVideos = [...videos.values()]
          .sort((left,right) => right.publishedAt.localeCompare(left.publishedAt) || left.id.localeCompare(right.id))
          .slice(0,MAX_RECENT_VIDEOS);
        await save(batchId,channel,started,recentVideos);
      } catch (error) {
        const code = error instanceof Error && errorMessages[error.message] ? error.message : "API_ERROR";
        await updateRequest(batchId,ids,"failed",channel.id,code);
      }
  }
  await batchState(batchId,groups.size,true);
  } catch {
    await failBatch(batchId);
  }
}
