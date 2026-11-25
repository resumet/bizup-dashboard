import assert from "node:assert/strict";
import test from "node:test";
import { fetchTrackingUtms } from "./tracking";

const courseId = "88b413ed-0ee1-4fd5-872d-b7ede9cb1f53";
const landing = `https://www.bizupclass.com/free-courses/${courseId}`;
const affiliate = { freeCourseId: courseId, urlLink: `${landing}?channel=influencer&code=6n3y5y&media=youtube`, shortUrl: "https://m.site.naver.com/example" };
const flight = (rows: unknown[]) => "b:" + JSON.stringify(["$", "component", null, {
  influencerUsers: [
    { username: "늦지않았다", ErpUserReferralLink: [{ code: "old-code" }, { code: "6n3y5y" }] },
    { username: "초월스토리", ErpUserReferralLink: [{ code: "6uq51m" }] },
    { username: "현장속으로_자체MCN", ErpUserReferralLink: [{ code: "mcn" }] },
  ],
  paidPlatforms: [{ code: "grossimpact", name: "그로스임팩트" }],
  referralLinks: rows,
}]);

test("저장 계정으로 로그인한 뒤 해당 강의의 매체별 UTM과 단축 링크를 읽는다", async t => {
  const { SYSTEMNOVA_ADMIN_ID: oldId, SYSTEMNOVA_ADMIN_PASSWORD: oldPassword } = process.env;
  process.env.SYSTEMNOVA_ADMIN_ID = "test";
  process.env.SYSTEMNOVA_ADMIN_PASSWORD = "test";
  t.after(() => {
    if (oldId === undefined) delete process.env.SYSTEMNOVA_ADMIN_ID; else process.env.SYSTEMNOVA_ADMIN_ID = oldId;
    if (oldPassword === undefined) delete process.env.SYSTEMNOVA_ADMIN_PASSWORD; else process.env.SYSTEMNOVA_ADMIN_PASSWORD = oldPassword;
  });
  const read = (payload: string) => fetchTrackingUtms(landing, async (url, init) => {
    if (String(url).endsWith("/api/login")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { id: "test", password: "test" });
      return new Response(null, { headers: { "Set-Cookie": "AdminSession=fixture; HttpOnly" } });
    }
    assert.equal(String(url), `https://admin.systemnova.co.kr/free-courses/${courseId}/tracking`);
    assert.equal(new Headers(init?.headers).get("cookie"), "AdminSession=fixture");
    assert.equal(new Headers(init?.headers).get("accept"), "text/html");
    assert.equal(new Headers(init?.headers).has("rsc"), false);
    return new Response(payload);
  });
  const payload = flight([affiliate, { ...affiliate, urlLink: landing + "?channel=organic&media=tH68Mi", shortUrl: null },
    { ...affiliate, urlLink: landing + "?channel=grossimpact&media=new_medium" }]);
  const rows = await read(payload);
  assert.deepEqual(rows.map(r => [r.channel, r.referral_code, r.medium]), [
    ["제휴", "늦지않았다", "유튜브"], ["오가닉", "비즈업클래스", "문자메시지"], ["페이드", "그로스임팩트", "new_medium"],
  ]);
  assert.equal(rows[0].url, affiliate.urlLink);
  assert.equal(rows[0].short_url, affiliate.shortUrl);
  assert.equal(rows[1].short_url, "");
  const mcnLinks = ["y7RRLt", "nFTpN3"].map(media => ({
    ...affiliate, urlLink: `${landing}?channel=influencer&code=mcn&media=${media}`,
  }));
  const mcnRows = await read(flight(mcnLinks));
  assert.deepEqual(mcnRows.map(row => [row.channel, row.referral_code, row.medium]), [
    ["제휴", "현장속으로_자체MCN", "현장속으로_메타"],
    ["제휴", "현장속으로_자체MCN", "현장속으로_구글"],
  ]);
  assert.deepEqual(mcnRows.map(row => row.url), mcnLinks.map(link => link.urlLink));
  const chunks = ["7:T5,hellob:".concat(payload.slice(2, 40)), payload.slice(40)];
  assert.deepEqual(await read(chunks.map(chunk => `<script>self.__next_f.push([1,${JSON.stringify(chunk)}])</script>`).join("")), rows);
  assert.deepEqual(await read(flight([])), []);
  assert.equal((await read(flight([{ ...affiliate, label: '강사 "]" [테스트]', urlLink: affiliate.urlLink.replace("6n3y5y", "6uq51m") }])))[0].referral_code, "초월스토리");
  for (const malformed of ["<html>login</html>", payload.slice(0, -10), flight([affiliate, { ...affiliate, freeCourseId: "other" }]),
    flight([{ ...affiliate, shortUrl: "javascript:invalid" }]), flight([affiliate, affiliate])]) {
    await assert.rejects(read(malformed));
  }
});
