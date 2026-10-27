import type { BodyPart, NormalizedPoint, Pose, PosesFile } from "../types";
import { isAbsoluteCinemaPose } from "./absoluteCinemaPose";
import { gapScore, HAND_MIN, handCentre, mirrorHands, scoreHand } from "./handMatcher";
import type { HandReading } from "./hands";
import { normalise, scorePoseBoth } from "./poseMatcher";
import { bestExampleScore, bodyTemplates } from "./poseCalibration";
import { hasMedia, visiblePoses } from "./poseMedia";

export interface PoseScore {
  poseId: string;
  /** 0–100, or null when the pose can't be compared (joints not visible, no template) */
  score: number | null;
  threshold: number;
  holdMs: number;
}

const isHandPart = (part: BodyPart): part is "leftHand" | "rightHand" => part === "leftHand" || part === "rightHand";
const isBodyPart = (part: BodyPart) => !isHandPart(part);

/** Poses the overlay should try to detect: visible, enabled, with media, and recorded (body and each ticked hand) if custom. */
export function detectablePoses(file: PosesFile): Pose[] {
  return visiblePoses(file).filter((pose) => {
    if (!pose.enabled || !hasMedia(pose)) return false;
    if (pose.kind === "builtin") return true;
    const hands = pose.bodyParts.filter(isHandPart);
    if (pose.bodyParts.some(isBodyPart) && !pose.template) return false;
    if (hands.length === 0 && !pose.template) return false;
    return hands.every((part) => !!pose.hands?.[part === "leftHand" ? "left" : "right"]);
  });
}

/** Which hands the enabled poses need read. A mirrored pose can be matched by the opposite hand, so it needs both. */
export function posesNeedHands(poses: Pose[]): { left: boolean; right: boolean } {
  const need = { left: false, right: false };
  for (const pose of poses) {
    if (!pose.enabled) continue;
    const left = pose.bodyParts.includes("leftHand");
    const right = pose.bodyParts.includes("rightHand");
    if (pose.mirror && (left || right)) {
      need.left = need.right = true;
    } else {
      need.left ||= left;
      need.right ||= right;
    }
  }
  return need;
}

type LiveHands = { left?: HandReading; right?: HandReading };

/** Mean score of the ticked hands against `hands` templates, or null if any is unseen or under HAND_MIN. */
function scoreHands(
  pose: Pose,
  ticked: Array<"left" | "right">,
  templates: NonNullable<Pose["hands"]>,
  landmarks: NormalizedPoint[],
  aspect: number,
  live: LiveHands
): number | null {
  const position = pose.handPosition !== false;
  const direction = pose.handDirection !== false;
  let gap: number | undefined;
  if (ticked.length === 2 && position && templates.gap && live.left && live.right) {
    const l = handCentre(live.left.points, landmarks, aspect);
    const r = handCentre(live.right.points, landmarks, aspect);
    if (l && r) gap = gapScore({ x: r.x - l.x, y: r.y - l.y }, templates.gap);
  }
  let total = 0;
  for (const side of ticked) {
    const reading = live[side];
    const template = templates[side];
    if (!reading || !template) return null;
    const score = scoreHand(reading.points, landmarks, aspect, template, { position, direction, gapScore: gap });
    if (score < HAND_MIN) return null;
    total += score;
  }
  return total / ticked.length;
}

function mean(parts: Array<number | null>): number | null {
  if (parts.length === 0 || parts.some((part) => part === null)) return null;
  return (parts as number[]).reduce((sum, part) => sum + part, 0) / parts.length;
}

/** Direct and mirrored body scores, each taken from the closest example. */
function bestBoth(
  live: NormalizedPoint[],
  templates: NormalizedPoint[][],
  bodyParts: BodyPart[]
): { direct: number | null; flipped: number | null } {
  let direct: number | null = null;
  let flipped: number | null = null;
  for (const template of templates) {
    const both = scorePoseBoth(live, template, bodyParts);
    if (both.direct !== null && (direct === null || both.direct > direct)) direct = both.direct;
    if (both.flipped !== null && (flipped === null || both.flipped > flipped)) flipped = both.flipped;
  }
  return { direct, flipped };
}

function scoreCustom(pose: Pose, landmarks: NormalizedPoint[], aspect: number, hands: LiveHands): number | null {
  const bodyParts = pose.bodyParts.filter(isBodyPart);
  const ticked = (["left", "right"] as const).filter((side) =>
    pose.bodyParts.includes(side === "left" ? "leftHand" : "rightHand")
  );
  const live = normalise(landmarks, aspect);
  if (!live) return null;
  const templates = bodyTemplates(pose);
  if (ticked.length === 0) {
    return templates.length > 0 ? bestExampleScore(live, templates, { bodyParts, mirror: pose.mirror }) : null;
  }
  if (!pose.hands) return null;

  const body = bodyParts.length > 0 && pose.template ? bestBoth(live, templates, bodyParts) : null;
  if (bodyParts.length > 0 && !body) return null;
  const direct = mean([...(body ? [body.direct] : []), scoreHands(pose, ticked, pose.hands, landmarks, aspect, hands)]);
  if (!pose.mirror) return direct;

  // Mirrored: the left reading plays the recorded right hand and vice versa.
  const swapped = ticked.map((side) => (side === "left" ? "right" : "left")) as Array<"left" | "right">;
  const flipped = mean([
    ...(body ? [body.flipped] : []),
    scoreHands(pose, swapped, mirrorHands(pose.hands), landmarks, aspect, hands),
  ]);
  if (direct === null) return flipped;
  if (flipped === null) return direct;
  return Math.max(direct, flipped);
}

/**
 * Scores one frame against each pose. The built-in pose is rule-based, so it scores
 * 100 or nothing; custom poses use the template matcher, averaging the body part and each ticked hand.
 */
export function scoreFrame(
  poses: Pose[],
  landmarks: NormalizedPoint[] | null,
  aspect: number,
  hands: LiveHands = {}
): PoseScore[] {
  return poses.map((pose) => {
    let score: number | null = null;
    if (landmarks && pose.builtinId === "absolute-cinema") {
      score = isAbsoluteCinemaPose(landmarks) ? 100 : null;
    } else if (landmarks && pose.kind === "custom") {
      score = scoreCustom(pose, landmarks, aspect, hands);
    }
    return { poseId: pose.id, score, threshold: pose.threshold, holdMs: pose.holdMs };
  });
}
