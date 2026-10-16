import assert from "node:assert/strict";
import test from "node:test";
import { channelLandingUtm, resolveLandingUtm } from "./utm";
import { appearanceSchema, emptyAppearance, publicAppearanceSchema } from "./model";
import type { LandingUtm } from "@/lib/course-landing-utms/model";

const item: LandingUtm = { id: "one", channel: "제휴", referral_code: "테스트 채널", medium: "유튜브", url: "https://example.test/landing?code=one", short_url: "https://example.test/one" };
test("UTM auto-fill matches normalized referral names and prefers YouTube", () => {
  assert.equal(channelLandingUtm(" 테스트채널 ", [item, {...item,id:"two",medium:"인스타그램",short_url:"https://example.test/two"}]), item.short_url);
  assert.equal(channelLandingUtm("다른 채널", [item]), "");
  assert.equal(channelLandingUtm("", [item]), "");
  assert.equal(channelLandingUtm("테스트 채널", [item,{...item,id:"two",channel:"다른 제휴"}]), "");
});
test("UTM refresh uses updated links and preserves an explicit saved choice or legacy URL", () => {
  assert.equal(resolveLandingUtm("테스트 채널", "https://example.test/old", [item]), item.short_url);
  assert.equal(resolveLandingUtm("테스트 채널", "https://example.test/two", [item,{...item,id:"two",referral_code:"별도 채널",short_url:"https://example.test/two"}]), "https://example.test/two");
  assert.equal(resolveLandingUtm("기존 채널", "https://example.test/legacy", [item]), "https://example.test/legacy");
  assert.equal(resolveLandingUtm("테스트 채널", "", [{...item,short_url:""}]), item.url);
});
test("both API schemas enforce appearance confirmation before filming confirmation and date", () => {
  const row={...emptyAppearance(),id:"00000000-0000-4000-8000-000000000001",channel_name:"채널"};
  for(const schema of [appearanceSchema,publicAppearanceSchema]) {
    assert.equal(schema.safeParse(row).success,true);
    assert.equal(schema.safeParse({...row,filming_confirmed:true,filming_at:"2026-11-03T05:30:00.000Z"}).success,false);
    assert.equal(schema.safeParse({...row,request_status:"confirmed",filming_confirmed:true}).success,false);
    assert.equal(schema.safeParse({...row,request_status:"confirmed",filming_at:"2026-11-03T05:30:00.000Z"}).success,false);
    assert.equal(schema.safeParse({...row,request_status:"confirmed",filming_confirmed:true,filming_at:"2026-11-03T05:30:00.000Z"}).success,true);
  }
});
