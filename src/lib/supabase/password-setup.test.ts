import assert from "node:assert/strict";
import test from "node:test";
import { AuthApiError, type SupabaseClient, type User } from "@supabase/supabase-js";

import { passwordSetupError, saveAccountPassword } from "./password-setup";

const account = { id: "invited-user", app_metadata: {} } as User;

function clientFor(user: User | null = account, error: AuthApiError | null = null) {
  const passwords: string[] = [];
  const client = { auth: {
    getUser: async () => ({ data: { user }, error: user ? null : new AuthApiError("missing", 401, "session_not_found") }),
    updateUser: async ({ password }: { password: string }) => {
      passwords.push(password);
      return { data: { user }, error };
    },
  } } as unknown as SupabaseClient;
  return { client, passwords };
}

test("길이와 확인 입력을 먼저 검증하여 잘못된 비밀번호를 전송하지 않는다", async () => {
  const { client, passwords } = clientFor();
  assert.match(await saveAccountPassword(client, account.id, "short", "short", 8) ?? "", /8자/u);
  assert.match(await saveAccountPassword(client, account.id, "ValidPassword!1", "different", 8) ?? "", /일치하지/u);
  assert.deepEqual(passwords, []);
});

test("세션 없음, 다른 탭의 계정 변경, 비활성 계정에서는 비밀번호를 바꾸지 않는다", async () => {
  for (const user of [null, { ...account, id: "different-account" }, { ...account, app_metadata: { account_disabled: true } }]) {
    const { client, passwords } = clientFor(user);
    assert.ok(await saveAccountPassword(client, account.id, "ValidPassword!1", "ValidPassword!1"));
    assert.deepEqual(passwords, []);
  }
});

test("인증된 동일 계정만 비밀번호를 업데이트하고 세션을 유지한다", async () => {
  const { client, passwords } = clientFor();
  assert.equal(await saveAccountPassword(client, account.id, "  ValidPassword!1  ", "  ValidPassword!1  "), null);
  assert.deepEqual(passwords, ["  ValidPassword!1  "], "password whitespace must not be trimmed");
});

test("Supabase 비밀번호 정책 오류는 원본 메시지를 노출하지 않고 재시도 안내를 제공한다", async () => {
  const { client } = clientFor(account, new AuthApiError("upstream-private-message", 422, "weak_password"));
  const message = await saveAccountPassword(client, account.id, "ValidPassword!1", "ValidPassword!1");
  assert.match(message ?? "", /보안 정책/u);
  assert.doesNotMatch(message ?? "", /upstream-private-message/u);
  assert.match(passwordSetupError({ code: "same_password" }), /다른 비밀번호/u);
  assert.match(passwordSetupError({ code: "reauthentication_needed" }), /다시 로그인/u);
  assert.match(passwordSetupError({ status: 503 }), /다시 시도/u);
});

test("네트워크 예외 후 비밀번호 저장을 재시도할 수 있다", async () => {
  const { client, passwords } = clientFor();
  const original = client.auth.updateUser;
  client.auth.updateUser = async () => { throw new Error("private transport details"); };
  assert.match(await saveAccountPassword(client, account.id, "ValidPassword!1", "ValidPassword!1") ?? "", /연결/u);
  client.auth.updateUser = original;
  assert.equal(await saveAccountPassword(client, account.id, "ValidPassword!1", "ValidPassword!1"), null);
  assert.equal(passwords.length, 1);
});
