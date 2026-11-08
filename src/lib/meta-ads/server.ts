import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v26.0";
export const META_AD_MEDIA_BUCKET = "meta-ad-media";
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

type MetaInsight = { ad_id?: string; impressions?: string; reach?: string; clicks?: string; spend?: string; ctr?: string; cpc?: string; actions?: Array<{ action_type?: string; value?: string }> };
type MetaAd = { id: string; name?: string; effective_status?: string; campaign?: { id?: string; name?: string }; adset?: { id?: string; name?: string }; creative?: { id?: string; thumbnail_url?: string; image_url?: string; image_hash?: string; video_id?: string; object_story_spec?: { link_data?: { message?: string; link?: string; picture?: string; name?: string }; video_data?: { message?: string; video_id?: string; image_url?: string; title?: string } } } };

function token() {
  const value = process.env.META_ACCESS_TOKEN;
  if (!value) throw new Error("META_ACCESS_TOKEN이 설정되지 않았습니다. 배포 환경 변수에 시스템 사용자 액세스 토큰을 추가해 주세요.");
  return value;
}

function accountId(value: string) {
  const id = value.trim().replace(/^act_/u, "");
  if (!/^\d+$/u.test(id)) throw new Error("메타 광고 계정 ID는 숫자만 입력해 주세요.");
  return `act_${id}`;
}

async function meta(path: string, init?: RequestInit) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}${separator}access_token=${encodeURIComponent(token())}`, { ...init, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message || "Meta API 요청에 실패했습니다.");
  return body as Record<string, unknown>;
}

const number = (value: string | undefined) => Number(value ?? 0);
function leads(actions: MetaInsight["actions"]) {
  return (actions ?? []).filter((item) => ["lead", "onsite_conversion.lead_grouped"].includes(item.action_type ?? "")).reduce((sum, item) => sum + number(item.value), 0);
}

export async function loadMetaAds(adAccountId: string) {
  const account = accountId(adAccountId);
  const fields = "id,name,effective_status,campaign{id,name},adset{id,name},creative{id,thumbnail_url,image_url,image_hash,video_id,object_story_spec}";
  const [adsResult, insightsResult] = await Promise.all([
    meta(`${account}/ads?fields=${encodeURIComponent(fields)}&effective_status=['ACTIVE']&limit=100`),
    meta(`${account}/insights?level=ad&date_preset=last_7d&fields=${encodeURIComponent("ad_id,impressions,reach,clicks,spend,ctr,cpc,actions")}&limit=500`),
  ]);
  const insights = new Map(((insightsResult.data as MetaInsight[] | undefined) ?? []).map((row) => [row.ad_id, row]));
  return ((adsResult.data as MetaAd[] | undefined) ?? []).map((ad) => {
    const insight = insights.get(ad.id);
    const spec = ad.creative?.object_story_spec;
    return {
      id: ad.id, name: ad.name ?? "이름 없는 광고", status: ad.effective_status ?? "UNKNOWN",
      campaign: ad.campaign?.name ?? "-", adset: ad.adset?.name ?? "-",
      impressions: number(insight?.impressions), reach: number(insight?.reach), clicks: number(insight?.clicks), spend: number(insight?.spend), ctr: number(insight?.ctr), cpc: number(insight?.cpc), leads: leads(insight?.actions),
      mediaUrl: ad.creative?.image_url || ad.creative?.thumbnail_url || spec?.link_data?.picture || spec?.video_data?.image_url || null,
      message: spec?.link_data?.message || spec?.video_data?.message || "", link: spec?.link_data?.link || "", creativeId: ad.creative?.id ?? null,
    };
  });
}

export async function saveMetaMedia(workspaceId: string, actorId: string, file: File) {
  const image = file.type.startsWith("image/"); const video = file.type.startsWith("video/");
  if (!image && !video) throw new Error("이미지 또는 영상 파일만 업로드할 수 있습니다.");
  if (file.size <= 0 || file.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) throw new Error(video ? "영상은 200MB 이하만 업로드할 수 있습니다." : "이미지는 30MB 이하만 업로드할 수 있습니다.");
  const suffix = file.name.split(".").pop()?.toLowerCase() || "bin";
  const storagePath = `${workspaceId}/${randomUUID()}.${suffix}`;
  const admin = createAdminClient();
  const upload = await admin.storage.from(META_AD_MEDIA_BUCKET).upload(storagePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (upload.error) throw new Error(`소재 저장 실패: ${upload.error.message}`);
  const insert = await admin.from("meta_ad_creative_drafts").insert({ workspace_id: workspaceId, file_name: file.name.slice(0, 240), media_type: image ? "image" : "video", storage_path: storagePath, created_by: actorId }).select("id,file_name,media_type,storage_path,created_at").single();
  if (insert.error) throw new Error(`소재 기록 저장 실패: ${insert.error.message}`);
  return insert.data;
}

export async function listMetaMedia(workspaceId: string) {
  const admin = createAdminClient();
  const result = await admin.from("meta_ad_creative_drafts").select("id,file_name,media_type,storage_path,meta_asset_id,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
  if (result.error) throw new Error(`소재 목록 조회 실패: ${result.error.message}`);
  return Promise.all((result.data ?? []).map(async (row) => ({ ...row, signedUrl: (await admin.storage.from(META_AD_MEDIA_BUCKET).createSignedUrl(row.storage_path, 3600)).data?.signedUrl ?? null })));
}

export async function configureMetaAccount(workspaceId: string, actorId: string, adAccountId: string) {
  const admin = createAdminClient(); const normalized = accountId(adAccountId);
  const result = await admin.from("meta_ad_workspace_settings").upsert({ workspace_id: workspaceId, ad_account_id: normalized, updated_by: actorId }, { onConflict: "workspace_id" }).select("ad_account_id").single();
  if (result.error) throw new Error(`광고 계정 설정 저장 실패: ${result.error.message}`);
  return result.data.ad_account_id;
}

export async function metaSettings(workspaceId: string) {
  const result = await createAdminClient().from("meta_ad_workspace_settings").select("ad_account_id,updated_at").eq("workspace_id", workspaceId).maybeSingle();
  if (result.error) throw new Error(`광고 계정 설정 조회 실패: ${result.error.message}`);
  return result.data;
}
