import type { BodyPart, NormalizedPoint, Pose } from "../types";
import type { LiveHands } from "./handPass";
import { handCentre, makeHandTemplate } from "./handMatcher";
import { MIN_GOOD_FRAMES, averageTemplate, isUsableFrame, normalise } from "./poseMatcher";

export type RecordPart = "body" | "leftHand" | "rightHand";

export interface RecordedFrame {
  landmarks: NormalizedPoint[] | null;
  aspect: number;
  hands?: LiveHands;
}

export interface RecordingResult {
  template: NormalizedPoint[] | null;
  hands?: Pose["hands"];
  error?: RecordPart;
}

const SIDE = { leftHand: "left", rightHand: "right" } as const;

const bodyPartsOf = (parts: BodyPart[]) => parts.filter((p) => p !== "leftHand" && p !== "rightHand");
const handPartsOf = (parts: BodyPart[]) => (["leftHand", "rightHand"] as const).filter((p) => parts.includes(p));

/** Which recordable parts this frame shows clearly (only the ticked ones are checked). */
export function seenParts(frame: RecordedFrame, parts: BodyPart[]): Set<RecordPart> {
  const seen = new Set<RecordPart>();
  if (!frame.landmarks) return seen;
  const body = bodyPartsOf(parts);
  if (body.length > 0 && isUsableFrame(frame.landmarks, frame.aspect, body)) seen.add("body");
  // A hand position is shoulder-relative, so the shoulders must be found too
  const shoulders = normalise(frame.landmarks, frame.aspect) !== null;
  for (const part of handPartsOf(parts)) if (shoulders && frame.hands?.[SIDE[part]]) seen.add(part);
  return seen;
}

/** The ticked parts, in error order: body first, then the left hand, then the right one. */
export function recordParts(parts: BodyPart[]): RecordPart[] {
  return [...(bodyPartsOf(parts).length > 0 ? (["body"] as const) : []), ...handPartsOf(parts)];
}

/** A frame is clear when every ticked body joint and every ticked hand is seen. */
export function clearFrame(frame: RecordedFrame, parts: BodyPart[]): boolean {
  const seen = seenParts(frame, parts);
  return recordParts(parts).every((p) => seen.has(p));
}

/**
 * Builds the recording from the clear frames. `seenCounts` (frames where each part was seen,
 * clear or not) names the missing part when there are too few clear frames.
 */
export function buildRecording(
  clear: RecordedFrame[],
  parts: BodyPart[],
  seenCounts: Partial<Record<RecordPart, number>> = {}
): RecordingResult {
  const wanted = recordParts(parts);
  if (wanted.length === 0) return { template: null, error: "body" };
  if (clear.length < MIN_GOOD_FRAMES) {
    const missing = wanted.find((p) => (seenCounts[p] ?? 0) < MIN_GOOD_FRAMES) ?? wanted[0];
    return { template: null, error: missing };
  }
  const aspect = clear[0].aspect;
  const bodies = clear.map((f) => f.landmarks!);
  let template: NormalizedPoint[] | null = null;
  if (wanted.includes("body")) {
    template = averageTemplate(bodies, aspect, bodyPartsOf(parts));
    if (!template) return { template: null, error: "body" };
  }
  const handParts = handPartsOf(parts);
  if (handParts.length === 0) return { template };

  const hands: NonNullable<Pose["hands"]> = {};
  for (const part of handParts) {
    const side = SIDE[part];
    const made = makeHandTemplate(
      clear.map((f) => f.hands![side]!.points),
      bodies,
      aspect
    );
    if (!made) return { template: null, error: part };
    hands[side] = made;
  }
  if (handParts.length === 2) {
    const gaps = clear.flatMap((f) => {
      const l = handCentre(f.hands!.left!.points, f.landmarks!, aspect);
      const r = handCentre(f.hands!.right!.points, f.landmarks!, aspect);
      return l && r ? [{ x: r.x - l.x, y: r.y - l.y }] : [];
    });
    if (gaps.length > 0) {
      hands.gap = {
        x: gaps.reduce((s, g) => s + g.x, 0) / gaps.length,
        y: gaps.reduce((s, g) => s + g.y, 0) / gaps.length,
      };
    }
  }
  return { template, hands };
}

export interface RecordTicks {
  body: boolean;
  leftHand: boolean;
  rightHand: boolean;
}

/** Body = arms + head, as before hands existed. */
export function ticksToParts(ticks: RecordTicks): BodyPart[] {
  return [
    ...(ticks.body ? (["arms", "head"] as const) : []),
    ...(ticks.leftHand ? (["leftHand"] as const) : []),
    ...(ticks.rightHand ? (["rightHand"] as const) : []),
  ];
}
