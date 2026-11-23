import test from "node:test";
import assert from "node:assert/strict";
import {
  accountSecurity,
  validateNewPassword,
  validEmail,
} from "../src/lib/accountSecurity";
import { verifyAccountCallback } from "../src/lib/authCallback";
import { settingsGroups } from "../src/lib/settingsCatalog";
function fixture() {
  const calls: string[] = [];
  const state = { fail: false, mismatch: false, mfa: false };
  const auth: any = {
    getUser: async () => ({
      data: { user: { id: "owner", email: "owner@example.com" } },
    }),
    signInWithPassword: async () => {
      calls.push("reauth");
      return {
        data: { user: { id: state.mismatch ? "other" : "owner" } },
        error: state.fail ? new Error("secret error") : null,
      };
    },
    updateUser: async () => {
      calls.push("update");
      return { error: null };
    },
    signOut: async () => {
      calls.push("signout");
      return { error: null };
    },
    resetPasswordForEmail: async () => {
      calls.push("reset");
      return { error: null };
    },
    mfa: {
      getAuthenticatorAssuranceLevel: async () => ({
        data: { currentLevel: "aal1", nextLevel: state.mfa ? "aal2" : "aal1" },
        error: null,
      }),
      listFactors: async () => ({
        data: { totp: [{ id: "factor", status: "verified" }] },
        error: null,
      }),
      challengeAndVerify: async () => {
        calls.push("mfa");
        return { error: null };
      },
    },
  };
  return {
    calls,
    state,
    service: accountSecurity(auth, "https://app.example/auth-confirm"),
  };
}
test("sensitive account changes validate inputs and reauthenticate before provider updates", async () => {
  const f = fixture();
  await f.service.changePassword("current", "a-new-password", "a-new-password");
  assert.deepEqual(f.calls, ["reauth", "update"]);
  await f.service.changeEmail("new@example.com", "current");
  assert.deepEqual(f.calls.slice(-2), ["reauth", "update"]);
  assert.throws(() => validateNewPassword("short", "short"));
  assert.throws(() => validateNewPassword("a-new-password", "different"));
  assert.equal(validEmail("not email"), false);
});
test("failed reauthentication and account switches never update sensitive information", async () => {
  const f = fixture();
  f.state.fail = true;
  await assert.rejects(
    f.service.changeEmail("new@example.com", "wrong"),
    /verify your password/,
  );
  assert.deepEqual(f.calls, ["reauth"]);
  f.state.fail = false;
  f.state.mismatch = true;
  await assert.rejects(
    f.service.changeEmail("new@example.com", "current"),
    /account changed/,
  );
  assert.ok(!f.calls.includes("update"));
  assert.equal(f.calls.at(-1), "signout");
});
test("configured second factors must verify before sensitive provider updates", async () => {
  const f = fixture();
  f.state.mfa = true;
  await assert.rejects(
    f.service.changePassword("current", "a-new-password", "a-new-password"),
    /authenticator code/,
  );
  assert.ok(!f.calls.includes("update"));
  await f.service.changePassword(
    "current",
    "a-new-password",
    "a-new-password",
    "123456",
  );
  assert.deepEqual(f.calls.slice(-3), ["reauth", "mfa", "update"]);
});
test("recovery callbacks use the PKCE verifier and distinguish ordinary confirmation", async () => {
  const calls: unknown[] = [];
  const user = { id: "owner" };
  const auth = {
    exchangeCodeForSession: async (
      code: string,
      options?: { flowId: string },
    ) => {
      calls.push([code, options]);
      return {
        data: {
          user,
          session: { user },
          redirectType: code === "reset" ? "recovery" : null,
        },
        error: null,
      };
    },
  } as unknown as Parameters<typeof verifyAccountCallback>[0];
  const callback = "worthit://auth-confirm";
  assert.equal(
    (
      await verifyAccountCallback(
        auth,
        callback + "?code=reset&sb_flow_id=flow",
      )
    ).recovery,
    true,
  );
  assert.equal(
    (await verifyAccountCallback(auth, callback + "?code=signup&type=recovery"))
      .recovery,
    false,
  );
  await assert.rejects(
    verifyAccountCallback(auth, callback + "#error_code=otp_expired"),
    /expired/,
  );
  assert.deepEqual(calls, [
    ["reset", { flowId: "flow" }],
    ["signup", undefined],
  ]);
});

test("settings sections have distinct real destinations and retain required activity/actions", () => {
  const keys = settingsGroups.flatMap((group) =>
    group.items.map((item) => item.key),
  );
  assert.equal(keys.length, new Set(keys).size);
  for (const key of [
    "personal",
    "security",
    "privacy",
    "appearance",
    "notifications",
    "language",
    "archive",
    "saved",
    "stars",
    "polls",
    "comments",
    "help",
    "report",
    "terms",
    "policy",
    "about",
    "logout",
    "deactivate",
    "delete",
  ])
    assert.ok(keys.includes(key as any), key);
});
