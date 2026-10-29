import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("계산 상세가 있는 유튜브 비용만 지급완료로 백필한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.course_costs (
        id text primary key,
        status text not null,
        paid_date date,
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        include_in_settlement boolean not null default true,
        calculation_details jsonb
      );
      insert into public.course_costs(id,status,calculation_details) values
        ('rs','PLANNED','{"kind":"YOUTUBE_RS"}'),
        ('appearance','PLANNED','{"kind":"YOUTUBE_APPEARANCE_FEE"}'),
        ('custom','PLANNED',null),
        ('canceled','CANCELED','{"kind":"YOUTUBE_RS"}');
      insert into public.course_costs(id,status,include_in_settlement,calculation_details)
        values ('excluded','PLANNED',false,'{"kind":"YOUTUBE_RS"}');
    `);
    await db.exec(await readFile(
      "supabase/migrations/20261029214500_mark_calculated_youtube_costs_paid.sql",
      "utf8",
    ));
    const result = await db.query<{ id: string; status: string; paid_date: string | null }>(
      "select id,status,paid_date::text from public.course_costs order by id",
    );
    const rows = new Map(result.rows.map((row) => [row.id, row]));
    assert.equal(rows.get("rs")?.status, "PAID");
    assert.match(rows.get("rs")?.paid_date ?? "", /^\d{4}-\d{2}-\d{2}$/u);
    assert.equal(rows.get("appearance")?.status, "PAID");
    assert.equal(rows.get("custom")?.status, "PLANNED");
    assert.equal(rows.get("canceled")?.status, "CANCELED");
    assert.equal(rows.get("excluded")?.status, "PLANNED");
  } finally {
    await db.close();
  }
});
