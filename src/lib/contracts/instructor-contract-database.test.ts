import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

test("기존 계약서 템플릿을 보존하면서 여러 템플릿과 계약서 스냅샷을 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      insert into auth.users values ('${userId}');
      insert into public.workspaces values ('${workspaceId}');
    `);
    const originalMigration = await readFile("supabase/migrations/20261105092440_instructor_contract_templates.sql", "utf8");
    await db.exec(originalMigration);
    await db.query(
      "insert into public.instructor_contract_templates (workspace_id,template,updated_by) values ($1,$2::jsonb,$3)",
      [workspaceId, JSON.stringify({ version: 2, content: [] }), userId],
    );

    const migration = await readFile("supabase/migrations/20261105163017_expand_instructor_contracts.sql", "utf8");
    await db.exec(migration);
    const signingMigration = await readFile("supabase/migrations/20261106010944_instructor_contract_e_signing.sql", "utf8");
    await db.exec(signingMigration);
    const removalMigration = await readFile("supabase/migrations/20261106015000_remove_instructor_contract_e_signing.sql", "utf8");
    await db.exec(removalMigration);
    const removedColumns = await db.query<{ column_name: string }>(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'instructor_contracts'
        and column_name in ('signing_status', 'public_token_hash', 'signature_image_data')
    `);
    assert.equal(removedColumns.rows.length, 0);

    const migrated = await db.query<{ id: string; name: string }>(
      "select id,name from public.instructor_contract_templates where workspace_id = $1",
      [workspaceId],
    );
    assert.equal(migrated.rows.length, 1);
    assert.equal(migrated.rows[0]?.name, "기본 계약서");
    assert.match(migrated.rows[0]?.id ?? "", /^[0-9a-f-]{36}$/u);

    const second = await db.query<{ id: string }>(
      `insert into public.instructor_contract_templates
        (workspace_id,name,template,created_by,updated_by)
       values ($1,'릴스 대행 계약서',$2::jsonb,$3,$3)
       returning id`,
      [workspaceId, JSON.stringify({ version: 2, content: [] }), userId],
    );
    const templateId = second.rows[0]?.id;
    assert.ok(templateId);

    await assert.rejects(
      db.query(
        `insert into public.instructor_contract_templates
          (workspace_id,name,template,created_by,updated_by)
         values ($1,'릴스 대행 계약서',$2::jsonb,$3,$3)`,
        [workspaceId, JSON.stringify({ version: 2, content: [] }), userId],
      ),
      /instructor_contract_templates_workspace_name_idx/u,
    );

    await db.query(
      `insert into public.instructor_contracts
        (workspace_id,template_id,template_name,title,instructor_name,lecture_name,contract_values,rendered_content,created_by,created_by_name)
       values ($1,$2,'릴스 대행 계약서','윤지혜 - 인스타그램 실전 계약서','윤지혜','인스타그램 실전',$3::jsonb,$4::jsonb,$5,'권정인')`,
      [
        workspaceId,
        templateId,
        JSON.stringify({
          instructorName: "윤지혜",
          lectureName: "인스타그램 실전",
          instagramNumberOfReels: "12",
          instagramValueOfReels: "1500000",
          startDate: "2026-11-06",
          durationYears: 1,
          address: "",
          phone: "",
          email: "",
        }),
        JSON.stringify([{ id: "00000000-0000-4000-8000-000000000010", type: "paragraph", content: "저장된 전문" }]),
        userId,
      ],
    );
    await db.query("delete from public.instructor_contract_templates where id = $1", [templateId]);
    const saved = await db.query<{ template_id: string | null; template_name: string; rendered_content: unknown }>(
      "select template_id,template_name,rendered_content from public.instructor_contracts",
    );
    assert.deepEqual(saved.rows, [{
      template_id: null,
      template_name: "릴스 대행 계약서",
      rendered_content: [{ id: "00000000-0000-4000-8000-000000000010", type: "paragraph", content: "저장된 전문" }],
    }]);
  } finally {
    await db.close();
  }
});

