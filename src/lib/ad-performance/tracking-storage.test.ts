import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CSV 원본은 Storage 버킷과 업로드에서 동일한 MIME 타입을 사용한다", async () => {
  const [serverSource, migration] = await Promise.all([
    readFile("src/lib/ad-performance/sheet-server.ts", "utf8"),
    readFile(
      "supabase/migrations/20261006030402_allow_ad_performance_tracking_csv.sql",
      "utf8",
    ),
  ]);

  assert.match(serverSource, /const CSV_CONTENT_TYPE = "text\/csv";/u);
  assert.doesNotMatch(
    serverSource,
    /const CSV_CONTENT_TYPE = "text\/csv; charset=utf-8";/u,
  );
  assert.match(migration, /'text\/csv'/u);
});
