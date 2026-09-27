import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPersonnelFixture, personnelFixtureIds } from "@/lib/personnel/fixture";

const otherWorkspace = "00000000-0000-4000-8000-000000000099";

test("WBS employee names include unlinked employed staff and stay workspace scoped", async () => {
  const db = await createPersonnelFixture();
  try {
    await db.query("insert into public.workspaces (id) values ($1)", [otherWorkspace]);
    await db.query(
      "update personnel_private.employees set name = '  Linked Employee  ' where workspace_id = $1 and user_id = $2",
      [personnelFixtureIds.workspace, personnelFixtureIds.staff],
    );
    await db.query(
      `insert into personnel_private.employees (workspace_id, email, name, employment_start_date, status)
       values ($1, 'unlinked-one@example.test', '  Unlinked Employee  ', '2026-01-01', 'employed'),
              ($1, 'unlinked-two@example.test', 'Unlinked Employee', '2026-01-01', 'employed'),
              ($1, 'former@example.test', 'Former Employee', '2026-01-01', 'resigned'),
              ($2, 'other@example.test', 'Other Workspace Employee', '2026-01-01', 'employed')`,
      [personnelFixtureIds.workspace, otherWorkspace],
    );

    const migration = await readFile("supabase/migrations/202609270003_course_wbs_employee_names.sql", "utf8");
    await db.exec(migration);

    assert.equal((await db.query<{ allowed: boolean }>(
      "select has_function_privilege('service_role', 'public.course_wbs_employee_names(uuid)', 'EXECUTE') allowed",
    )).rows[0].allowed, true);
    assert.equal((await db.query<{ allowed: boolean }>(
      "select has_function_privilege('authenticated', 'public.course_wbs_employee_names(uuid)', 'EXECUTE') allowed",
    )).rows[0].allowed, false);

    await db.exec("set role service_role");
    const names = (await db.query<{ names: string[] }>(
      "select public.course_wbs_employee_names($1) names",
      [personnelFixtureIds.workspace],
    )).rows[0].names;
    assert.equal(names.filter((name) => name === "Linked Employee").length, 1);
    assert.equal(names.filter((name) => name === "Unlinked Employee").length, 1);
    assert.ok(!names.includes("Former Employee"));
    assert.ok(!names.includes("Other Workspace Employee"));
    assert.deepEqual((await db.query<{ names: string[] }>(
      "select public.course_wbs_employee_names($1) names",
      [otherWorkspace],
    )).rows[0].names, ["Other Workspace Employee"]);
    await db.exec("reset role");

    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select public.course_wbs_employee_names($1)", [personnelFixtureIds.workspace]),
      /permission denied for function course_wbs_employee_names/,
    );
  } finally {
    await db.close();
  }
});
