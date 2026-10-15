import assert from "node:assert/strict";
import test from "node:test";
import { parseLandingUtms, UTM_HEADERS, validWebUrl } from "./model";
import { readUtmUpload, loadLandingUtms } from "./server";
import writeXlsxFile from "write-excel-file/node";

const row = ["제휴", "초월스토리 ", "유튜브", "https://www.bizupclass.com/free-courses/test?code=6uq51m&channel=influencer&media=youtube", "https://m.site.naver.com/2htXQ"];
test("날짜를 무시하고 공백·열 순서·선행 안내행을 처리하며 다섯 필드만 저장한다", () => {
  const parsed = parseLandingUtms([["UTM 목록"], ["생성일", ...UTM_HEADERS], ["날짜 형식 무관", ...row], [], ["날짜만 있음"]]);
  assert.deepEqual(parsed, [{ channel: "제휴", referral_code: "초월스토리", medium: "유튜브", url: row[3], short_url: row[4] }]);
  assert.deepEqual(parseLandingUtms([[...UTM_HEADERS].reverse(), [...row].reverse()]), parsed);
  assert.deepEqual(parseLandingUtms([["유입채널", "추천코드", "진행매체", "url", "단축링크"], row]), parsed);
});
test("추천 코드·단축링크 빈 값 허용, 누락 헤더·빈 파일·동일 키 중복은 행번호로 거부", () => {
  assert.equal(parseLandingUtms([UTM_HEADERS as unknown as string[], ["오가닉", "", "인스타그램", row[3], ""]])[0].short_url, "");
  assert.throws(() => parseLandingUtms([]), /유입 채널/);
  assert.throws(() => parseLandingUtms([["유입 채널"]]), /필수 열/);
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS, "URL"], row]), /중복된 열/);
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS]]), /등록할/);
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS], row, [...row, "ignored"]]), /3행은 2행/);
});
test("위험한 주소·누락값·길이 초과·행 수 초과를 저장 전에 차단한다", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "//example.com", "https://", "https://user:pass@example.com", "https://a.test/white space"]) {
    assert.equal(validWebUrl(url), false);
    assert.throws(() => parseLandingUtms([[...UTM_HEADERS], [...row.slice(0, 3), url, row[4]]]), /2행 URL/);
  }
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS], [...row.slice(0, 4), "javascript:test"]]), /2행 단축 링크/);
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS], ["", ...row.slice(1)]]), /2행 유입 채널/);
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS], ["a".repeat(151), ...row.slice(1)]]), /150자/);
  assert.throws(() => parseLandingUtms([[...UTM_HEADERS], ...Array.from({ length: 2001 }, (_, i) => ["제휴", `추천${i}`, ...row.slice(2)])]), /2,000행/);
});
test("실제 XLSX 업로드는 날짜 열을 버리고 확장자·크기·손상 파일을 검증한다", async () => {
  const buffer = await writeXlsxFile([["생성일", ...UTM_HEADERS], ["2026.08.18", ...row]].map(values => values.map(value => ({ value, type: String })))).toBuffer();
  const form = new FormData(); form.set("file", new File([new Uint8Array(buffer)], "utm.xlsx"));
  assert.deepEqual((await readUtmUpload(form)).rows, parseLandingUtms([[...UTM_HEADERS], row]));
  for (const file of [new File(["test"], "utm.csv"), new File([], "utm.xlsx"), new File([new Uint8Array(4194305)], "utm.xlsx"), new File(["broken"], "utm.xlsx")]) {
    form.set("file", file); await assert.rejects(readUtmUpload(form));
  }
});
test("1,000건을 넘는 저장 목록도 강의 범위를 유지해 전부 조회한다", async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), ...parseLandingUtms([[...UTM_HEADERS], row])[0] }));
  const admin = { from(table: string) {
    assert.equal(table, "course_landing_utms");
    const query = { select() { return query; }, eq(field: string, value: string) { assert.equal(field, "course_id"); assert.equal(value, "course"); return query; }, order() { return query; }, async range(start: number, end: number) { return { data: rows.slice(start, end + 1), error: null }; } };
    return query;
  } };
  assert.equal((await loadLandingUtms(admin as unknown as Parameters<typeof loadLandingUtms>[0], "course")).length, 1001);
});
