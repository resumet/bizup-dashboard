import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("담당자는 같은 워크스페이스의 재직 직원으로 지정하고, 잘못된 배정은 설정과 함께 롤백한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema personnel_private;
      create table personnel_private.employees(id uuid primary key, workspace_id uuid, name text, status text);
      create table public.course_document_settings(course_id uuid primary key, workspace_id uuid, instagram_total_count smallint);
      create function public.resize_instagram_progress(uuid,uuid,text,smallint,smallint,smallint) returns void language sql as
        'update public.course_document_settings set instagram_total_count=$4 where course_id=$1 and workspace_id=$2';
      create function public.refresh_instagram_upload_schedule(uuid) returns void language sql as 'select';
      grant select,update on public.course_document_settings to service_role;
    `);
    await db.exec(await readFile("supabase/migrations/20261123052910_instagram_assignee.sql", "utf8"));
    const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const [course, workspace, employee, former, outsider] = [1, 2, 3, 4, 5].map(id);
    await db.query("insert into course_document_settings values ($1,$2,1,null)", [course, workspace]);
    await db.query("insert into personnel_private.employees values ($1,$4,'직원','employed'),($2,$4,'퇴사자','resigned'),($3,$3,'다른 팀','employed')", [employee, former, outsider, workspace]);
    const save = (who: string | null, count: number, setAssignee = true) =>
      db.query("select public.save_instagram_settings($1,$2,'',$3::smallint,0::smallint,0::smallint,$4,$5)", [course, workspace, count, who, setAssignee]);
    const state = async () => (await db.query("select instagram_total_count, instagram_assignee_id from course_document_settings")).rows[0];
    await db.exec("set role service_role");
    assert.deepEqual((await db.query("select id from public.instagram_employee_directory($1)", [workspace])).rows, [{ id: employee }]);
    await save(employee, 2);
    await assert.rejects(save(former, 3), /INVALID_INSTAGRAM_ASSIGNEE/);
    await assert.rejects(save(outsider, 3), /INVALID_INSTAGRAM_ASSIGNEE/);
    assert.deepEqual(await state(), { instagram_total_count: 2, instagram_assignee_id: employee });
    await save(null, 4, false);
    assert.deepEqual(await state(), { instagram_total_count: 4, instagram_assignee_id: employee });
    await db.exec("reset role");
    await db.query("update personnel_private.employees set status='resigned' where id=$1", [employee]);
    await db.exec("set role service_role");
    assert.deepEqual((await db.query("select name, active from public.instagram_employee_directory($1)", [workspace])).rows, [{ name: "직원", active: false }]);
    await save(employee, 5);
    await save(null, 5);
    assert.deepEqual(await state(), { instagram_total_count: 5, instagram_assignee_id: null });
    await db.exec("set role authenticated");
    await assert.rejects(save(employee, 5), /permission denied/);
    await assert.rejects(db.query("select * from public.instagram_employee_directory($1)", [workspace]), /permission denied/);
  } finally { await db.close(); }
});
