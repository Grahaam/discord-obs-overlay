import type { ApprovalMode, ApprovalReason } from "../src/types.js";

export interface PosterTrust {
  /** How many of this person's alerts a moderator approved. */
  approvedCount: number;
  /** The streamer pressed "Always approve this person". */
  always: boolean;
}

export interface ApprovalInput {
  mode: ApprovalMode;
  /** Roles whose members never need approval. */
  trustedRoleIds: string[];
  /** Approved alerts after which a poster is trusted on their own. */
  newPosterCount: number;
  posterRoleIds: string[];
  trust: PosterTrust;
}

export type ApprovalDecision = { hold: false } | { hold: true; reason: ApprovalReason };

/**
 * Whether an alert has to wait in the inbox before going on air.
 * A trusted role or an "always approve" skips approval in every mode, so "everyone" still lets the streamer's
 * regulars through; only the approved-alerts history is ignored there.
 */
export function decideApproval(input: ApprovalInput): ApprovalDecision {
  if (input.mode === "off") return { hold: false };
  if (input.trustedRoleIds.some((id) => input.posterRoleIds.includes(id))) return { hold: false };
  if (input.trust.always) return { hold: false };
  if (input.mode === "everyone") return { hold: true, reason: "everyone" };
  if (input.trust.approvedCount >= Math.max(1, input.newPosterCount)) return { hold: false };
  return { hold: true, reason: input.trust.approvedCount === 0 ? "new_poster" : "not_trusted_yet" };
}
