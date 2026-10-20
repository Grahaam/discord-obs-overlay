import type { NormalizedPoint } from "../types";

export function skeleton(
  overrides: Partial<Record<number, [number, number]>> = {},
  opts: { visibility?: number } = {}
): NormalizedPoint[] {
  const points = Array.from({ length: 33 }, (_, index) => {
    const [x, y] = overrides[index] ?? [0.5, 0.5];
    return { x, y, visibility: opts.visibility ?? 1 };
  });
  return points;
}

export const armsUp = skeleton({
  11: [0.4, 0.5],
  12: [0.6, 0.5],
  13: [0.32, 0.35],
  14: [0.68, 0.35],
  15: [0.25, 0.15],
  16: [0.75, 0.15],
});

export const tPose = skeleton({
  11: [0.4, 0.5],
  12: [0.6, 0.5],
  13: [0.25, 0.5],
  14: [0.75, 0.5],
  15: [0.1, 0.5],
  16: [0.9, 0.5],
});

export const armsCrossed = skeleton({
  11: [0.4, 0.5],
  12: [0.6, 0.5],
  13: [0.48, 0.62],
  14: [0.52, 0.62],
  15: [0.55, 0.58],
  16: [0.45, 0.58],
});

export const handsOnHead = skeleton({
  0: [0.5, 0.2],
  11: [0.4, 0.5],
  12: [0.6, 0.5],
  13: [0.3, 0.35],
  14: [0.7, 0.35],
  15: [0.42, 0.18],
  16: [0.58, 0.18],
  7: [0.47, 0.22],
  8: [0.53, 0.22],
});

export const rightArmUp = skeleton({
  11: [0.4, 0.5],
  12: [0.6, 0.5],
  13: [0.3, 0.35],
  14: [0.7, 0.35],
  15: [0.2, 0.15],
  16: [0.8, 0.45],
});
