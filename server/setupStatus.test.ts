import test from "node:test";
import assert from "node:assert";
import { computeSetupStatus, cached, markAlertStarted, wasAlertStarted, overlayClients } from "./setupStatus.js";

const ok = {
  botStatus: "connected",
  channelConfigured: true,
  channelIssue: null,
  overlayClients: 1,
  obs: { ok: true as const, obsVersion: "31.0" },
  testAlertSeen: true,
  cookiesConfigured: false,
};

test("computeSetupStatus: everything fine", () => {
  const s = computeSetupStatus(ok);
  assert.deepStrictEqual([s.bot, s.overlay, s.obs, s.testAlertSeen], [true, true, true, true]);
  assert.strictEqual(s.details.obsVersion, "31.0");
});

test("computeSetupStatus: bot needs connection, a channel and no channel issue", () => {
  assert.strictEqual(computeSetupStatus({ ...ok, botStatus: "connecting" }).bot, false);
  assert.strictEqual(computeSetupStatus({ ...ok, channelConfigured: false }).bot, false);
  const issue = { kind: "no_access" as const, channelId: "1", missing: ["ViewChannel"], inviteUrl: "u" };
  assert.strictEqual(computeSetupStatus({ ...ok, channelIssue: issue }).bot, false);
});

test("computeSetupStatus: overlay and obs failures", () => {
  assert.strictEqual(computeSetupStatus({ ...ok, overlayClients: 0 }).overlay, false);
  const s = computeSetupStatus({ ...ok, obs: { ok: false, errorCode: "unreachable", error: "x" } });
  assert.strictEqual(s.obs, false);
  assert.strictEqual(s.details.obsErrorCode, "unreachable");
});

test("computeSetupStatus: cookies step mirrors cookiesConfigured and is independent of the others", () => {
  assert.strictEqual(computeSetupStatus(ok).cookies, false);
  assert.strictEqual(computeSetupStatus({ ...ok, cookiesConfigured: true }).cookies, true);
  const broken = computeSetupStatus({ ...ok, botStatus: "error", cookiesConfigured: true });
  assert.strictEqual(broken.bot, false);
  assert.strictEqual(broken.cookies, true);
});

test("overlayClients counts distinct sockets", () => {
  overlayClients.add("a");
  overlayClients.add("a");
  overlayClients.add("b");
  assert.strictEqual(overlayClients.count(), 2);
  overlayClients.remove("a");
  overlayClients.remove("b");
  assert.strictEqual(overlayClients.count(), 0);
});

test("alert started tracking", () => {
  markAlertStarted("x");
  assert.ok(wasAlertStarted("x"));
  assert.ok(!wasAlertStarted("y"));
  assert.ok(!wasAlertStarted(undefined));
});

test("cached: reuses the result within the ttl, refreshes after", async () => {
  let t = 0;
  let calls = 0;
  const f = cached(
    3000,
    async () => ++calls,
    () => t
  );
  assert.strictEqual(await f(), 1);
  t = 2999;
  assert.strictEqual(await f(), 1);
  t = 3000;
  assert.strictEqual(await f(), 2);
});
