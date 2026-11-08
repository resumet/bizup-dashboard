import { hasAdminAccess } from "@/lib/admin/access";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { configureMetaAccount, listMetaMedia, loadMetaAds, metaSettings, saveMetaMedia } from "@/lib/meta-ads/server";
import { createClient } from "@/lib/supabase/server";

async function context() { const client = await createClient(); const user = await requireCourseOperationsUser(client); const membership = await requireCourseOperationsMembership(user.id); if (!hasAdminAccess(user.email, membership.role)) throw new Error("FORBIDDEN"); return { user, workspaceId: membership.workspace_id }; }
function error(error: unknown) { const message = error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; return Response.json({ error: message }, { status: message === "FORBIDDEN" ? 403 : 400 }); }

export async function GET() { try { const { workspaceId } = await context(); const settings = await metaSettings(workspaceId); const media = await listMetaMedia(workspaceId); const ads = settings?.ad_account_id && process.env.META_ACCESS_TOKEN ? await loadMetaAds(settings.ad_account_id) : []; return Response.json({ settings, media, ads, connected: Boolean(settings?.ad_account_id && process.env.META_ACCESS_TOKEN) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (e) { return error(e); } }
export async function PUT(request: Request) { try { const { workspaceId, user } = await context(); const body = await request.json() as { adAccountId?: unknown }; if (typeof body.adAccountId !== "string") throw new Error("광고 계정 ID를 입력해 주세요."); return Response.json({ adAccountId: await configureMetaAccount(workspaceId, user.id, body.adAccountId) }); } catch (e) { return error(e); } }
export async function POST(request: Request) { try { const { workspaceId, user } = await context(); const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) throw new Error("업로드할 소재를 선택해 주세요."); return Response.json({ media: await saveMetaMedia(workspaceId, user.id, file) }, { status: 201 }); } catch (e) { return error(e); } }
