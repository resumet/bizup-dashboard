import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

test("비품 신청 DB가 금액·승인·구매 상태와 서버 전용 접근을 강제한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      insert into auth.users values ('${USER}');
      insert into public.workspaces values ('${WORKSPACE}');
    `);
    await db.exec(await readFile("supabase/migrations/20261025090000_supply_requests.sql", "utf8"));

    await db.exec("set role anon");
    await assert.rejects(() => db.query("select * from public.supply_requests"), /permission denied/u);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(() => db.query("select * from public.supply_requests"), /permission denied/u);

    await db.exec("reset role; set role service_role");
    await db.query(
      `insert into public.supply_requests
        (workspace_id, requester_id, requester_name, item_name, price_krw, purpose)
       values ($1, $2, '권정인', '촬영용 삼각대', 120000, '강의 촬영')`,
      [WORKSPACE, USER],
    );
    const initial = await db.query<{ approval_status: string; purchased: boolean; version: number }>(
      "select approval_status, purchased, version from public.supply_requests",
    );
    assert.deepEqual(initial.rows[0], { approval_status: "pending", purchased: false, version: 1 });

    await assert.rejects(() => db.query(
      `insert into public.supply_requests
        (workspace_id, requester_name, item_name, price_krw, purpose)
       values ($1, '권정인', '잘못된 가격', -1, '테스트')`,
      [WORKSPACE],
    ), /supply_requests_price_krw_check/u);
    await assert.rejects(() => db.exec(
      "update public.supply_requests set purchased=true, purchased_at=now()",
    ), /supply_requests_purchase_state_check/u);

    await db.exec(`
      update public.supply_requests
      set approval_status='approved', reviewed_at=now(), version=version+1;
      update public.supply_requests
      set purchased=true, purchased_at=now(), version=version+1;
    `);
    const completed = await db.query<{ approval_status: string; purchased: boolean; version: number }>(
      "select approval_status, purchased, version from public.supply_requests",
    );
    assert.deepEqual(completed.rows[0], { approval_status: "approved", purchased: true, version: 3 });
  } finally {
    await db.close();
  }
});
