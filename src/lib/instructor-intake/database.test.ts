import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("강사 수집 DB는 워크스페이스 접근, 익명 접근 차단, 저장 충돌과 비공개 사진을 보장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.workspaces (id uuid primary key);
      create table public.workspace_members (workspace_id uuid, user_id uuid);
      create function public.is_workspace_member(target uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.workspace_members where workspace_id=target and user_id=auth.uid()) $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/20261005034418_instructor_intake.sql",
        "utf8",
      ),
    );
    const w1 = "00000000-0000-4000-8000-000000000001",
      w2 = "00000000-0000-4000-8000-000000000002",
      u1 = "00000000-0000-4000-8000-000000000003";
    await db.query("insert into public.workspaces values ($1),($2)", [w1, w2]);
    await db.query("insert into auth.users values ($1)", [u1]);
    await db.query("insert into public.workspace_members values ($1,$2)", [
      w1,
      u1,
    ]);
    const row = (
      await db.query<{ id: string }>(
        "insert into public.instructor_intakes(workspace_id,title,access_token,access_token_hash) values ($1,'강사', $2, $3) returning id",
        [w1, "a".repeat(48), "a".repeat(64)],
      )
    ).rows[0];
    await db.query(
      "insert into public.instructor_intakes(workspace_id,title,access_token,access_token_hash) values ($1,'다른 강사',$2,$3)",
      [w2, "b".repeat(48), "b".repeat(64)],
    );
    assert.equal(
      (
        await db.query(
          'update public.instructor_intakes set answers = \'{"realName":"홍길동"}\' where id=$1 and revision=0 returning revision',
          [row.id],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update public.instructor_intakes set answers = '{}' where id=$1 and revision=0 returning revision",
          [row.id],
        )
      ).rows.length,
      0,
    );
    await db.query(
      "update public.instructor_intakes set share_enabled=false where id=$1",
      [row.id],
    );
    assert.equal(
      (
        await db.query(
          "update public.instructor_intakes set answers='{}' where id=$1 and share_enabled=true returning id",
          [row.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "update public.instructor_intakes set photo_paths=$1 where id=$2",
        [Array(6).fill("photo"), row.id],
      ),
      /check constraint/,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u1]);
    await db.exec("set role authenticated");
    assert.deepEqual(
      (
        await db.query<{ title: string }>(
          "select title from public.instructor_intakes",
        )
      ).rows.map((row) => row.title),
      ["강사"],
    );
    await assert.rejects(
      db.query("update public.instructor_intakes set title='변경'"),
      /permission denied/,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select * from public.instructor_intakes"),
      /permission denied/,
    );
    await db.exec("reset role");
    const bucket = (
      await db.query<{ public: boolean }>(
        "select public from storage.buckets where id='instructor-profile-photos'",
      )
    ).rows[0];
    assert.equal(bucket.public, false);
  } finally {
    await db.close();
  }
});
