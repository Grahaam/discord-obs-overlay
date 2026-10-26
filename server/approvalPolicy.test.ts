import { test } from "node:test";
import assert from "node:assert/strict";
import { decideApproval, type ApprovalInput } from "./approvalPolicy.js";

const base: ApprovalInput = {
  mode: "new",
  trustedRoleIds: ["mod"],
  newPosterCount: 1,
  posterRoleIds: [],
  trust: { approvedCount: 0, always: false },
};
const decide = (patch: Partial<ApprovalInput>) => decideApproval({ ...base, ...patch });

test("off: nothing is held", () => {
  assert.deepEqual(decide({ mode: "off" }), { hold: false });
});

test("new: a poster never approved is held", () => {
  assert.deepEqual(decide({}), { hold: true, reason: "new_poster" });
});

test("new: one approval is enough by default", () => {
  assert.deepEqual(decide({ trust: { approvedCount: 1, always: false } }), { hold: false });
});

test("new: the poster stays held until N alerts were approved", () => {
  const input = { newPosterCount: 3 };
  assert.deepEqual(decide({ ...input, trust: { approvedCount: 2, always: false } }), {
    hold: true,
    reason: "not_trusted_yet",
  });
  assert.deepEqual(decide({ ...input, trust: { approvedCount: 3, always: false } }), { hold: false });
});

test("new: a threshold below 1 still requires one approval", () => {
  assert.equal(decide({ newPosterCount: 0 }).hold, true);
});

test("a trusted role skips approval in every mode", () => {
  for (const mode of ["new", "everyone"] as const) {
    assert.deepEqual(decide({ mode, posterRoleIds: ["other", "mod"] }), { hold: false });
  }
});

test("a role that is not trusted does not help", () => {
  assert.equal(decide({ posterRoleIds: ["other"] }).hold, true);
});

test("always approve skips approval in every mode", () => {
  for (const mode of ["new", "everyone"] as const) {
    assert.deepEqual(decide({ mode, trust: { approvedCount: 0, always: true } }), { hold: false });
  }
});

test("everyone: history does not count", () => {
  assert.deepEqual(decide({ mode: "everyone", trust: { approvedCount: 50, always: false } }), {
    hold: true,
    reason: "everyone",
  });
});
