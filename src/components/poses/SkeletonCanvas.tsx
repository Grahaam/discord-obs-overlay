import { useEffect, useRef } from "react";
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { NormalizedPoint } from "../../types";
import type { PoseFrame } from "../../hooks/usePoseLandmarks";
import { MIN_VISIBILITY } from "../../lib/poseMatcher";

const WIDTH = 640;
const CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;

interface Props {
  frame: PoseFrame | null;
  /** Normalised template of the selected pose, drawn as a translucent outline */
  ghost?: NormalizedPoint[];
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
function ghostToPixels(ghost: NormalizedPoint[], live: NormalizedPoint[] | null, aspect: number, h: number) {
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

export default function SkeletonCanvas({ frame, ghost, overlay }: Props) {
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
  }, [frame, ghost, aspect, height]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/[0.07] bg-black">
      <canvas ref={canvasRef} width={WIDTH} height={height} className="block w-full h-auto" />
      {overlay && <div className="absolute inset-0 flex items-center justify-center">{overlay}</div>}
    </div>
  );
}
