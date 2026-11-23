import assert from "node:assert/strict";
import test from "node:test";
import { channelSchema, appearanceSchema } from "./model";
test("채널 주소와 이름을 검증하고 빈 일정과 URL은 허용한다", () => {
  assert.equal(channelSchema.safeParse({ name: " ", manager_name: "", channel_url: "" }).success, false);
  assert.equal(channelSchema.safeParse({ name: "채널", manager_name: "담당자", channel_url: "javascript:alert(1)" }).success, false);
  const input = { course_id: "11111111-1111-4111-8111-111111111111", channel_id: "22222222-2222-4222-8222-222222222222", filming_date: "", location: "", original_drive_url: "", edited_drive_url: "", upload_date: "", published_url: "" };
  assert.equal(appearanceSchema.parse(input).filming_date, null);
  assert.equal(appearanceSchema.safeParse({ ...input, filming_date: "2026-02-30" }).success, false);
});
