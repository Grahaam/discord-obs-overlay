import { useEffect, useRef } from "react";
import { HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedPoint, Pose } from "../../types";
import type { CropBox } from "../../lib/handCrop";
import type { PoseFrame } from "../../hooks/usePoseLandmarks";
import { MIN_VISIBILITY } from "../../lib/poseMatcher";

const WIDTH = 640;
const CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;
const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;
const HAND_COLOR = "#f472b6";

interface Props {
  frame: PoseFrame | null;
  /** Normalised template of the selected pose, drawn as a translucent outline */
  ghost?: NormalizedPoint[];
  /** Recorded hands of the selected pose: their centres are drawn with the ghost */
  ghostHands?: Pose["hands"];
  overlay?: React.ReactNode;
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number; visibility: number }[],
  color: string,
  fadeHidden: boolean
) {
  ctx.lineWidth = 3;
  for (const { start, end } of CONNECTIONS) {
    const a = points[start];
    const b = points[end];
    if (!a || !b) continue;
    ctx.globalAlpha = fadeHidden && Math.min(a.visibility, b.visibility) < MIN_VISIBILITY ? 0.2 : 1;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const p of points) {
    ctx.globalAlpha = fadeHidden && p.visibility < MIN_VISIBILITY ? 0.2 : 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/**
 * Maps a normalised template (shoulder midpoint = 0, shoulder width = 1) back onto the
 * frame, sized and placed on the live shoulders so the streamer can line up with it.
 */
function ghostToPixels(
  ghost: { x: number; y: number; visibility: number }[],
  live: NormalizedPoint[] | null,
  aspect: number,
  h: number
) {
  const l = live?.[11];
  const r = live?.[12];
  const ok = l && r && l.visibility >= MIN_VISIBILITY && r.visibility >= MIN_VISIBILITY;
  // Without visible shoulders, centre it at a typical webcam framing
  const cx = ok ? ((l.x + r.x) / 2) * aspect : aspect / 2;
  const cy = ok ? (l.y + r.y) / 2 : 0.6;
  const sw = ok ? Math.abs(r.x - l.x) * aspect : 0.3 * aspect;
  return ghost.map((p) => ({
    x: ((p.x * sw + cx) / aspect) * WIDTH,
    y: (p.y * sw + cy) * h,
    visibility: p.visibility,
  }));
}

/** The rotated square the hand model looked at, scaled from screenshot pixels to the canvas. */
function drawCrop(ctx: CanvasRenderingContext2D, box: CropBox, scaleX: number, scaleY: number) {
  ctx.save();
  // The crop turns the frame by `angle`, so the box sits at -angle in frame space
  ctx.scale(scaleX, scaleY);
  ctx.translate(box.cx, box.cy);
  ctx.rotate(-box.angle);
  ctx.strokeStyle = `${HAND_COLOR}80`;
  ctx.lineWidth = 1.5 / scaleX;
  ctx.setLineDash([6 / scaleX, 4 / scaleX]);
  ctx.strokeRect(-box.size / 2, -box.size / 2, box.size, box.size);
  ctx.restore();
}

function drawHand(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], h: number) {
  const px = points.map((p) => ({ x: p.x * WIDTH, y: p.y * h }));
  ctx.strokeStyle = HAND_COLOR;
  ctx.fillStyle = HAND_COLOR;
  ctx.lineWidth = 2;
  for (const { start, end } of HAND_CONNECTIONS) {
    const a = px[start];
    const b = px[end];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const p of px) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function SkeletonCanvas({ frame, ghost, ghostHands, overlay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = frame?.aspect ?? 16 / 9;
  const height = Math.round(WIDTH / aspect);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let cancelled = false;
    const draw = (img?: HTMLImageElement) => {
      if (cancelled) return;
      ctx.clearRect(0, 0, WIDTH, height);
      if (img) ctx.drawImage(img, 0, 0, WIDTH, height);
      if (ghost) drawSkeleton(ctx, ghostToPixels(ghost, frame?.landmarks ?? null, aspect, height), "#c4b5fd80", false);
      const centres = [ghostHands?.left?.position, ghostHands?.right?.position].filter((p) => !!p);
      if (centres.length > 0) {
        const px = ghostToPixels(
          centres.map((p) => ({ ...p, visibility: 1 })),
          frame?.landmarks ?? null,
          aspect,
          height
        );
        ctx.fillStyle = `${HAND_COLOR}80`;
        for (const p of px) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (frame?.crops && frame.frameWidth && frame.frameHeight) {
        const sx = WIDTH / frame.frameWidth;
        const sy = height / frame.frameHeight;
        for (const box of [frame.crops.left, frame.crops.right]) if (box) drawCrop(ctx, box, sx, sy);
      }
      for (const hand of [frame?.hands?.left, frame?.hands?.right]) if (hand) drawHand(ctx, hand.points, height);
      if (frame?.landmarks) {
        const px = frame.landmarks.map((p) => ({ x: p.x * WIDTH, y: p.y * height, visibility: p.visibility }));
        drawSkeleton(ctx, px, "#34d399", true);
      }
    };
    if (!frame) return draw();
    const img = new Image();
    img.onload = () => draw(img);
    img.src = frame.frameUrl;
    return () => {
      cancelled = true;
    };
  }, [frame, ghost, ghostHands, aspect, height]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/[0.07] bg-black">
      <canvas ref={canvasRef} width={WIDTH} height={height} className="block w-full h-auto" />
      {overlay && <div className="absolute inset-0 flex items-center justify-center">{overlay}</div>}
    </div>
  );
}
