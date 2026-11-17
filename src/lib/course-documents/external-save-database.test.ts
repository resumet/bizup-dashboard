import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const courseId = "00000000-0000-4000-8000-000000000001";
const documentId = "00000000-0000-4000-8000-000000000002";
const workspaceId = "00000000-0000-4000-8000-000000000003";
const blockId = "00000000-0000-4000-8000-000000000004";
const token = "a".repeat(48);

test("외부 DM 본문 저장은 폐지된 알림 없이 완료되고 접근 제한과 리드게이트를 유지한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.courses(id uuid primary key, instructor_name text, name text);
      create table public.course_document_settings(course_id uuid,workspace_id uuid,external_access_token text,external_edit_enabled boolean);
      create table public.course_documents(id uuid primary key,course_id uuid,workspace_id uuid,title text,content jsonb,status text,published_at timestamptz,deleted_at timestamptz,lead_gate_enabled boolean,lead_gate_after_block_id text);
      create table public.course_instagram_materials(course_id uuid,document_id uuid,title text,dm_not_required boolean default false);
      create table public.media_notifications(workspace_id uuid,course_id uuid,kind text check(kind in ('youtube_brief','youtube_schedule','leave_request','calendar_event','youtube_channel','external_ad_performance','supply_request')),title text,message text,href text);
      insert into public.courses values ('${courseId}','teacher','course');
      insert into public.course_document_settings values ('${courseId}','${workspaceId}','${token}',true);
      insert into public.course_documents values ('${documentId}','${courseId}','${workspaceId}','title','[]','published',now(),null,true,'${blockId}');
      insert into public.course_instagram_materials(course_id,document_id,title) values ('${courseId}','${documentId}','material title');
      grant usage on schema public to service_role;
      grant all on all tables in schema public to service_role;
    `);
    const previous = await readFile("supabase/migrations/20261016025717_external_media_notifications.sql", "utf8");
    const oldFunction = previous.match(/create function public\.save_external_instagram_document[\s\S]*?\$\$;/)?.[0];
    assert.ok(oldFunction);
    await db.exec(oldFunction);
    const content = [{ id: blockId, type: "rich_text", content: { type: "paragraph", content: [{ type: "text", text: "가" }] } }];
    const save = (body = content, access = token) => db.query("select public.save_external_instagram_document($1,$2,$3) as result", [access, documentId, JSON.stringify(body)]);
    await assert.rejects(save(), /media_notifications_kind_check/);
    assert.deepEqual((await db.query<{ content: unknown }>("select content from public.course_documents")).rows[0].content, []);
    await db.exec(await readFile("supabase/migrations/20261117110818_fix_external_instagram_document_save.sql", "utf8"));
    await db.exec("set role service_role");
    await save();
    const saved = (await db.query<{ content: unknown; title: string; status: string; published_at: unknown; lead_gate_enabled: boolean }>("select * from public.course_documents")).rows[0];
    assert.deepEqual(saved.content, content);
    assert.equal(saved.title, "material title");
    assert.equal(saved.status, "draft");
    assert.equal(saved.published_at, null);
    assert.equal(saved.lead_gate_enabled, false);
    assert.equal((await db.query("select * from public.media_notifications")).rows.length, 0);
    await save();
    await db.exec(`update public.course_documents set lead_gate_enabled=true,lead_gate_after_block_id='${blockId}'`);
    await save([...content, { ...content[0], id: "00000000-0000-4000-8000-000000000005" }]);
    assert.equal((await db.query<{ lead_gate_enabled: boolean }>("select lead_gate_enabled from public.course_documents")).rows[0].lead_gate_enabled, true);
    await assert.rejects(save(content, "b".repeat(48)), /NOT_FOUND/);
    await db.exec("update public.course_instagram_materials set dm_not_required=true");
    await assert.rejects(save(), /NOT_FOUND/);
    await db.exec("update public.course_instagram_materials set dm_not_required=false; update public.course_document_settings set external_edit_enabled=false");
    await assert.rejects(save(), /NOT_FOUND/);
    await db.exec("reset role; set role anon");
    await assert.rejects(save(), /permission denied/);
  } finally { await db.close(); }
});
