import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { draftSchema, driveResource, newDraft, salesSnapshot } from "./model";
import { checkDriveAccess } from "./drive";

test("섹션 이미지는 기존 초안과 호환되고 공개 스냅샷에 보존된다", () => {
  const draft = newDraft("강의", "", "");
  assert.equal(draftSchema.parse({ ...draft, videoImageUrl: undefined }).videoImageUrl, "");
  assert.equal(draftSchema.safeParse({ ...draft, recapImageUrl: "javascript:alert(1)" }).success, false);
  const images = { videoImageUrl: "https://example.org/video.webp", recapImageUrl: "https://example.org/recap.webp", concernImageUrl: "https://example.org/concern.webp" };
  const parsed = draftSchema.parse({ ...draft, ...images });
  const snapshot = salesSnapshot(parsed, { name: "강의", instructor_name: "강사", payment_link: "" }, []);
  for (const key of Object.keys(images) as (keyof typeof images)[]) assert.equal(snapshot[key], images[key]);
  assert.equal(draftSchema.parse({ ...parsed, recapImageUrl: "" }).recapImageUrl, "");
});

test("강의 소속 영상, 결제 주소, 카드사별 기본값을 공개 데이터에 반영한다", () => {
  const draft = newDraft("무료 강의", "https://example.org/chat", "https://youtu.be/abcdefghijk");
  assert.equal(draft.cards.length, 12);
  assert.equal(draft.cards.find(r => r.issuer === "현대")?.installment, 24);
  assert.equal(draft.cards.find(r => r.issuer === "전북")?.interestFree, 3);
  assert.equal(draftSchema.safeParse(draft).success, true);
  assert.equal(draftSchema.parse({ ...draft, background: undefined }).background, "white");
  const legacy = draftSchema.parse({ ...draft, titleBackgroundColor: undefined, buttonColor: undefined });
  assert.equal(legacy.titleBackgroundColor, draft.titleBackgroundColor);
  assert.equal(legacy.buttonColor, draft.buttonColor);
  assert.equal(draftSchema.safeParse({ ...draft, buttonColor: "transparent" }).success, false);
  assert.equal(draftSchema.safeParse({ ...draft, background: "unknown" }).success, false);
  assert.equal(draftSchema.safeParse({ ...draft, chatUrl: "javascript:alert(1)" }).success, false);
  const video = { id: "b4197cc3-3636-4a01-aad0-d270d5bf8aba", label: "채널", url: draft.replayUrl };
  const snapshot = salesSnapshot({ ...draft, background: "mint", titleBackgroundColor: "#223344", buttonColor: "#ffeebb", videoId: video.id }, { name: "강의", instructor_name: "강사", payment_link: "https://example.org/pay" }, [video]);
  assert.equal(snapshot.background, "mint");
  assert.equal(snapshot.titleBackgroundColor, "#223344");
  assert.equal(snapshot.buttonColor, "#ffeebb");
  assert.equal(snapshot.videoUrl, video.url);
  assert.equal(snapshot.paymentUrl, "https://example.org/pay");
  assert.ok(!("videoId" in snapshot));
});

test("드라이브 검사는 익명 공개·로그인 필요·확인 불가를 구분한다", async t => {
  const url = "https://drive.google.com/drive/folders/abcdefghijk?resourcekey=xyz";
  assert.equal(driveResource(url)?.searchParams.get("resourcekey"), "xyz");
  assert.equal(driveResource("https://docs.google.com/spreadsheets/d/abcdefghijk/edit")?.pathname, "/spreadsheets/d/abcdefghijk/edit");
  assert.equal(driveResource("https://example.org/drive/folders/abcdefghijk"), null);
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("<title>강의 자료 - Google Drive</title></head>"));
  assert.equal((await checkDriveAccess(url)).accessible, true);
  mock.mock.mockImplementation(async () => Response.redirect("https://accounts.google.com/signin"));
  assert.equal((await checkDriveAccess(url)).accessible, false);
  mock.mock.mockImplementation(async () => new Response("<title>Google Drive</title></head>"));
  assert.equal((await checkDriveAccess(url)).accessible, false);
});

test("초안과 공개본 분리, 최초 공개·재공개 링크 저장, 동시 수정 및 워크스페이스 격리", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create table courses(id uuid primary key, workspace_id uuid, payment_link text, free_gift_link text, updated_at timestamptz);");
    await db.exec(await readFile("supabase/migrations/20261120041516_course_post_sales_pages.sql", "utf8"));
    const course = "00000000-0000-4000-8000-000000000001", workspace = "00000000-0000-4000-8000-000000000002";
    await db.query("insert into courses values($1,$2,'https://example.org/pay','legacy',now())", [course, workspace]);
    const save = async (revision: number, title: string, publish: boolean, ws = workspace) => {
      const snapshot = { title, paymentUrl: "https://example.org/pay" };
      return (await db.query<{ r: { revision: number; publicUrl: string | null } }>(
        "select save_course_post_sales_page($1,$2,$3,$4,$5,$6) r",
        [course, ws, revision, JSON.stringify({title}), publish ? JSON.stringify(snapshot) : null, "https://example.org"]
      )).rows[0].r;
    };
    assert.deepEqual(await save(0, "초안", false), { revision: 1, publicUrl: null });
    assert.equal((await db.query<{link:string}>("select free_gift_link link from courses")).rows[0].link, "legacy");
    const published = await save(1, "첫 공개", true);
    assert.match(published.publicUrl!, /^https:\/\/example.org\/public\/post-sales\//);
    await save(2, "편집 중", false);
    const row = (await db.query<{ title:string; link:string }>("select published->>'title' title, c.free_gift_link link from course_post_sales_pages join courses c on c.id=course_id")).rows[0];
    assert.deepEqual(row, { title: "첫 공개", link: published.publicUrl });
    await assert.rejects(save(2, "충돌", true), /STALE_REVISION/);
    await assert.rejects(save(3, "타 워크스페이스", true, course), /NOT_FOUND/);
    const next = await save(3, "수정 공개", true);
    assert.equal(next.publicUrl, published.publicUrl);
    await db.exec(await readFile("supabase/migrations/20261120083952_post_sales_public_access.sql", "utf8"));
    const visible = async () => (await db.query<{ title: string }>(
      "select published->>'title' title from course_post_sales_pages where public_url=$1 and public_enabled and published is not null", [next.publicUrl]
    )).rows.map(row => row.title);
    const toggle = (revision: number, enabled: boolean, ws = workspace) => db.query(
      "select set_post_sales_public_access($1,$2,$3,$4)", [course, ws, revision, enabled]);
    assert.deepEqual(await visible(), ["수정 공개"]);
    await assert.rejects(toggle(4, false, course), /NOT_FOUND/);
    await toggle(4, false);
    await assert.rejects(toggle(4, true), /STALE_REVISION/);
    await save(5, "공개되지 않은 초안", false);
    assert.deepEqual(await visible(), []);
    await toggle(6, true);
    assert.deepEqual(await visible(), ["수정 공개"]);
    await db.exec("set role anon");
    await assert.rejects(db.query("select draft from course_post_sales_pages"), /permission denied/);
    await assert.rejects(save(4, "권한 없음", true), /permission denied/);
    await assert.rejects(toggle(7, false), /permission denied/);
  } finally { await db.close(); }
});
