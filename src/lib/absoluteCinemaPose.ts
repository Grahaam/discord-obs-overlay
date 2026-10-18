import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// MediaPipe Pose landmark indices — https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_ELBOW = 13;
const R_ELBOW = 14;
const L_WRIST = 15;
const R_WRIST = 16;

const MIN_VISIBILITY = 0.6;
/**
 * Distance between wrists, relative to shoulder width, for the arms to count as spread.
 * Real webcam poses measured 1.68–1.82 (hands frame the face, closer than the elbows), so 1.5 leaves margin.
 */
const MIN_WRIST_SPREAD = 1.5;
const MIN_ELBOW_SPREAD = 1.3;

/**
 * "Absolute Cinema" pose: both forearms raised, hands above the shoulders and spread wide.
 * Coordinates are normalized to the frame, with y growing downward.
 */
export function isAbsoluteCinemaPose(landmarks: NormalizedLandmark[]): boolean {
  const points = [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST].map((i) => landmarks[i]);
  if (points.some((p) => !p || (p.visibility ?? 0) < MIN_VISIBILITY)) return false;

  const [ls, rs, le, re, lw, rw] = points;
  const shoulderWidth = Math.abs(ls.x - rs.x);
  if (shoulderWidth === 0) return false;

  const wristsAboveShoulders = lw.y < ls.y && rw.y < rs.y;
  const forearmsRaised = lw.y < le.y && rw.y < re.y;
  const wristsSpread = Math.abs(lw.x - rw.x) > shoulderWidth * MIN_WRIST_SPREAD;
  const elbowsSpread = Math.abs(le.x - re.x) > shoulderWidth * MIN_ELBOW_SPREAD;

  return wristsAboveShoulders && forearmsRaised && wristsSpread && elbowsSpread;
}
