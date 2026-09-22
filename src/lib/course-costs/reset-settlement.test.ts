import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("cost save resets only its settlement atomically and preserves source files", async () => {
  const db = new PGlite();
  const user = "00000000-0000-4000-8000-000000000001";
  const workspace = "00000000-0000-4000-8000-000000000002";
  const course = "00000000-0000-4000-8000-000000000003";
  const other = "00000000-0000-4000-8000-000000000004";
  const sql = (name: string) => readFile(`supabase/migrations/${name}.sql`, "utf8");
  try {
    await db.exec(`create schema auth; create role service_role; create role anon; create role authenticated;
      create table auth.users (id uuid primary key);
      create table workspaces (id uuid primary key);
      create table courses (id uuid primary key, workspace_id uuid);
      create table workspace_members (workspace_id uuid, user_id uuid);
      create table audit_logs (workspace_id uuid, actor_id uuid, event_type text, entity_type text, entity_id uuid, metadata jsonb);
      insert into auth.users values ('${user}'); insert into workspaces values ('${workspace}');
      insert into courses values ('${course}','${workspace}'),('${other}','${workspace}');
      insert into workspace_members values ('${workspace}','${user}');`);
    await db.exec((await sql("202608310001_course_settlements")).split("create index")[0]);
    await db.exec("alter table course_settlement_projects add column analysis_snapshot jsonb, add column statement_draft jsonb not null default '{}';");
    await db.exec((await sql("202609030003_course_cost_management")).split("create index")[0]);
    await db.exec(await sql("202609030006_bulk_save_course_costs"));
    await db.exec(await sql("202609230003_cost_changes_reset_settlement"));
    assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege('anon', 'public.save_course_cost_changes_and_reset_settlement(uuid,uuid,jsonb)', 'EXECUTE') as allowed")).rows[0].allowed, false);
    assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated', 'public.save_course_cost_changes_and_reset_settlement(uuid,uuid,jsonb)', 'EXECUTE') as allowed")).rows[0].allowed, false);
    await db.exec(`insert into course_settlement_projects (workspace_id,course_id,name,created_by,status,analysis_snapshot,statement_draft,latest_version)
      values ('${workspace}','${course}','Test','${user}','정산확정','{"total":100}','{"confirmedAt":"today"}',3),
      ('${workspace}','${other}','Other','${user}','정산확정','{"total":200}','{}',1);`);
    const project = (await db.query<{ id: string }>("select id from course_settlement_projects where course_id=$1", [course])).rows[0].id;
    await db.exec(`insert into course_settlement_versions(settlement_id,version,input_snapshot,result_snapshot,calculated_by)
      values ('${project}',3,'{}','{}','${user}');
      insert into settlement_cost_snapshots(settlement_id,cost_snapshot) values ('${project}','{}');
      insert into course_settlement_uploads(settlement_id,source_type,original_filename,checksum_sha256,row_count,rows,uploaded_by)
      values ('${project}','nova','source.xlsx','checksum',1,'[]','${user}');`);
    const save = (changes: unknown) => db.query<Record<string, unknown>>("select save_course_cost_changes_and_reset_settlement($1,$2,$3::jsonb)", [course, user, JSON.stringify(changes)]);
    await save({});
    assert.equal((await db.query<Record<string, unknown>>("select status from course_settlement_projects where id=$1", [project])).rows[0].status, "정산확정");
    await assert.rejects(save({ updates: [{ id: user, version: 1 }] }), /비용을 찾을/);
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from settlement_cost_snapshots")).rows[0].n, 1);
    assert.equal((await db.query<Record<string, unknown>>("select status from course_settlement_projects where id=$1", [project])).rows[0].status, "정산확정");
    await save({ creates: [{ category_code: "CUSTOM", name: "Cost", burden_type: "COMPANY", manager_name: "Manager", gross_amount: 110, supply_amount: 100, vat_amount: 10, status: "PAID", paid_date: "2026-09-22", company_share_rate: 100, instructor_share_rate: 0, company_share_amount: 110, instructor_share_amount: 0 }] });
    const result = (await db.query<Record<string, unknown>>("select status,analysis_snapshot,statement_draft,latest_version from course_settlement_projects where id=$1", [project])).rows[0];
    assert.deepEqual(result, { status: "비용입력중", analysis_snapshot: null, statement_draft: {}, latest_version: 4 });
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from settlement_cost_snapshots")).rows[0].n, 0);
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from course_settlement_versions")).rows[0].n, 0);
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from course_settlement_uploads")).rows[0].n, 1);
    assert.equal((await db.query<Record<string, unknown>>("select status from course_settlement_projects where course_id=$1", [other])).rows[0].status, "정산확정");
    const cost = (await db.query<{ id: string }>("select id from course_costs")).rows[0];
    await assert.rejects(save({ updates: [{ id: cost.id, version: 99 }] }), /다른 사용자/);
    assert.equal((await db.query<Record<string, unknown>>("select latest_version from course_settlement_projects where id=$1", [project])).rows[0].latest_version, 4);
    await db.exec(`update course_settlement_projects set status='정산확정' where id='${project}';
      insert into settlement_cost_snapshots(settlement_id,course_cost_id,cost_snapshot) values ('${project}','${cost.id}','{}');
      insert into course_cost_attachments(course_cost_id,storage_path,original_name,mime_type,file_size,uploaded_by)
      values ('${cost.id}','receipt','receipt.png','image/png',100,'${user}');`);
    const existing = (await db.query<Record<string, unknown>>("select * from course_costs where id=$1", [cost.id])).rows[0];
    await save({ updates: [{ ...existing, name: "Changed cost" }] });
    assert.equal((await db.query<Record<string, unknown>>("select name from course_costs where id=$1", [cost.id])).rows[0].name, "Changed cost");
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from course_cost_attachments")).rows[0].n, 1);
    assert.equal((await db.query<Record<string, unknown>>("select count(*)::int n from settlement_cost_snapshots")).rows[0].n, 0);
    await assert.rejects(db.query("select save_course_cost_changes_and_reset_settlement($1,$2,$3::jsonb)", [course, other, JSON.stringify({ deletes: [{ id: cost.id, version: 2 }] })]), /권한/);
    await save({ deletes: [{ id: cost.id, version: 2 }] });
    assert.notEqual((await db.query<Record<string, unknown>>("select deleted_at from course_costs where id=$1", [cost.id])).rows[0].deleted_at, null);
  } finally { await db.close(); }
});
