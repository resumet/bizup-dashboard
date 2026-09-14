import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("webinar database enforces access, persistence, versions and validation across courses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "webinar-test-"));
  let db = new PGlite(directory);
  const user = randomUUID(), outsider = randomUUID(), course1 = randomUUID(), course2 = randomUUID();
  const save = (courseId: string, metrics: object, version: number) => db.query<{ value: { course_id: string; payment_count: number; version: number; hours_to_peak: string; revenue: number } }>("select to_jsonb(public.save_course_webinar_metrics($1,$2,$3)) value", [courseId, JSON.stringify(metrics), version]);
  const login = async (id: string) => { await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec("set role authenticated"); };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.courses(id uuid primary key, workspace_id uuid not null);
      create table public.workspace_members(workspace_id uuid,user_id uuid);
      create function public.is_workspace_member(w uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid())$$;
      alter table public.courses enable row level security;
      create policy members on public.courses for select to authenticated using(public.is_workspace_member(workspace_id));
      grant select on public.courses to authenticated;`);
    const workspace = randomUUID();
    await db.query("insert into public.courses values($1,$3),($2,$3)", [course1, course2, workspace]);
    await db.query("insert into public.workspace_members values($1,$2)", [workspace, user]);
    await db.exec(await readFile("supabase/migrations/202609150001_course_webinar_metrics.sql", "utf8"));
    await login(user);
    const record = (await save(course1, { group_chat_count: 1000, communication_count: 400, live_start_count: 200, live_peak_count: 300, hours_to_peak: 1.5, live_end_count: 150, ad_spend: 1000000, payment_count: 20, revenue: 5000000 }, 0)).rows[0].value;
    assert.equal(record.course_id, course1); assert.equal(record.version, 1); assert.equal(Number(record.hours_to_peak), 1.5);
    await save(course2, { payment_count: 5, revenue: 0 }, 0);
    await assert.rejects(save(course1, { payment_count: 999 }, 0), /다른 사용자가/);
    assert.equal((await save(course1, { payment_count: 21, revenue: 5000000 }, 1)).rows[0].value.version, 2);
    await assert.rejects(save(course1, { payment_count: 999 }, 1), /다른 사용자가/);
    for (const data of [{ payment_count: 1.5 }, { ad_spend: -1 }, { revenue: 1e13 }, { hours_to_peak: 1.555 }, { version: 5 }, { live_start_count: 101, live_peak_count: 100 }]) await assert.rejects(save(course1, data, 2));
    await assert.rejects(db.query("update public.course_webinar_metrics set payment_count=999"), /permission denied/);
    await login(outsider);
    assert.equal((await db.query("select * from public.course_webinar_metrics")).rows.length, 0);
    await assert.rejects(save(course1, { payment_count: 9 }, 2), /접근 권한/);
    await db.exec("reset role; set role anon");
    await assert.rejects(save(course1, {}, 2), /permission denied/);
    await db.exec("reset role");
    await db.close(); db = new PGlite(directory);
    await login(user);
    const records = (await db.query<{ course_id: string; payment_count: number; revenue: number }>("select course_id,payment_count::int,revenue::int from public.course_webinar_metrics")).rows;
    assert.equal(records.find(row => row.course_id === course1)?.payment_count, 21);
    assert.equal(records.find(row => row.course_id === course2)?.payment_count, 5);
    assert.equal(records.find(row => row.course_id === course2)?.revenue, 0);
    await db.exec("reset role");
    await db.query("delete from public.courses where id=$1", [course2]);
    assert.equal((await db.query("select * from public.course_webinar_metrics where course_id=$1", [course2])).rows.length, 0);
  } finally {
    await db.close();
    assert.equal(resolve(dirname(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("webinar-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});
