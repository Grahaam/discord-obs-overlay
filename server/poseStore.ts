import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { z } from "zod";
import type { BodyPart, Pose, PosesFile, PoseMedia } from "../src/types.js";
import { DATA_PATHS } from "./paths.js";
import { settingsManager } from "./settingsManager.js";
import { logger } from "./logger.js";
import { cleanupUnusedUploads } from "./userAssets.js";

const bodyPartSchema = z.enum(["arms", "legs", "head", "leftHand", "rightHand"]);
const fingerStateSchema = z.enum(["up", "down", "any"]);
const fingerRecord = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ thumb: value, index: value, middle: value, ring: value, pinky: value });
const handTemplateSchema = z.object({
  fingers: fingerRecord(fingerStateSchema),
  curls: fingerRecord(z.number().min(0).max(1)),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  direction: z.object({ palm: z.number().finite(), thumb: z.number().finite() }),
});
const handsSchema = z.object({
  left: handTemplateSchema.optional(),
  right: handTemplateSchema.optional(),
  gap: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
});
const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  visibility: z.number().min(0).max(1),
});

// Both media types may keep the other type's fields: switching type in the dashboard keeps them until changed
const poseMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  imageUrl: z.string().optional(),
  soundUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  volume: z.number().min(0).max(1),
  durationSeconds: z.number().positive().optional(),
  maxDurationSeconds: z.number().min(5).max(120),
  fullscreen: z.boolean(),
});

const poseObjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["custom", "builtin"]),
  builtinId: z.literal("absolute-cinema").optional(),
  enabled: z.boolean(),
  template: z.array(pointSchema).length(33).optional(),
  bodyParts: z.array(bodyPartSchema),
  threshold: z.number().min(0).max(100),
  mirror: z.boolean(),
  holdMs: z.number().int().min(1),
  cooldownSeconds: z.number().int().min(5).max(3600),
  media: poseMediaSchema,
  hands: handsSchema.optional(),
  handPosition: z.boolean().optional(),
  handDirection: z.boolean().optional(),
});

type ParsedPose = z.infer<typeof poseObjectSchema>;

// A ticked hand needs its recorded template
function hasHandTemplates(pose: ParsedPose): boolean {
  return (
    (!pose.bodyParts.includes("leftHand") || Boolean(pose.hands?.left)) &&
    (!pose.bodyParts.includes("rightHand") || Boolean(pose.hands?.right))
  );
}

const poseSchema = poseObjectSchema.refine(hasHandTemplates, {
  message: "A ticked hand needs its template",
  path: ["hands"],
});

export const posesFileSchema = z.object({
  version: z.literal(1),
  poses: z.array(poseSchema),
  hiddenBuiltins: z.array(z.string()),
});

// Same shape without the hand check, so load() can drop single bad poses instead of the whole file
const looseFileSchema = z.object({
  version: z.literal(1),
  poses: z.array(poseObjectSchema),
  hiddenBuiltins: z.array(z.string()),
});

export type LegacyPoseSettings = {
  poseAlertImageUrl?: string;
  poseAlertSoundUrl?: string;
  poseCooldownSeconds?: number;
};

export function defaultBuiltinPose(settings: LegacyPoseSettings): Pose {
  const media: PoseMedia = {
    type: "image",
    imageUrl: settings.poseAlertImageUrl || "",
    soundUrl: settings.poseAlertSoundUrl || "",
    volume: 0.8,
    durationSeconds: 4,
    maxDurationSeconds: 30,
    fullscreen: true,
  };
  return {
    id: "absolute-cinema",
    name: "Absolute Cinema",
    kind: "builtin",
    builtinId: "absolute-cinema",
    enabled: true,
    bodyParts: ["arms", "head"] satisfies BodyPart[],
    threshold: 80,
    mirror: true,
    holdMs: 600,
    cooldownSeconds: settings.poseCooldownSeconds ?? 30,
    media,
  };
}

export { visiblePoses } from "../src/lib/poseMedia.js";

type PoseStoreEvents = {
  change: (file: PosesFile) => void;
};

export class PoseStore {
  private current: PosesFile | null = null;
  private readonly events = new EventEmitter();

  constructor(
    private readonly file: string,
    private readonly legacy: () => LegacyPoseSettings
  ) {}

  on<Event extends keyof PoseStoreEvents>(event: Event, listener: PoseStoreEvents[Event]): this {
    this.events.on(event, listener);
    return this;
  }

  load(): PosesFile {
    if (!fs.existsSync(this.file)) {
      return this.saveAndReturn(this.defaults());
    }

    try {
      const loose = looseFileSchema.parse(JSON.parse(fs.readFileSync(this.file, "utf8")));
      const usable = loose.poses.filter(hasHandTemplates);
      const dropped = loose.poses.filter((pose) => !hasHandTemplates(pose)).map((pose) => pose.id);
      if (dropped.length > 0) {
        // The re-save below rewrites the file: keep the original, a recording is hard to recreate
        const backup = `${this.file}.bad-${Date.now()}`;
        try {
          fs.copyFileSync(this.file, backup);
        } catch (copyErr) {
          logger.error({ err: copyErr, file: this.file }, "Failed to back up poses file before dropping poses");
        }
        logger.warn({ poseIds: dropped, backup }, "Dropping poses with a ticked hand but no template");
      }
      const parsed: PosesFile = { ...loose, poses: usable };
      const complete = this.withBuiltin(parsed);
      const builtinReAdded = complete.poses.length > usable.length;
      if (dropped.length > 0 || builtinReAdded) {
        this.save(complete);
        return this.get();
      }
      return this.setCurrent(complete);
    } catch (err) {
      const backup = `${this.file}.bad-${Date.now()}`;
      try {
        fs.renameSync(this.file, backup);
      } catch (backupErr) {
        logger.error({ err: backupErr, file: this.file }, "Failed to back up invalid poses file");
      }
      logger.error({ err, file: this.file, backup }, "Invalid poses file; restoring defaults");
      return this.saveAndReturn(this.defaults());
    }
  }

  get(): PosesFile {
    return this.current ?? this.load();
  }

  save(next: PosesFile): void {
    const parsed = posesFileSchema.parse(next);
    const complete = this.withBuiltin(parsed);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tempFile = `${this.file}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(complete, null, 2) + "\n", "utf8");
    try {
      fs.renameSync(tempFile, this.file);
    } catch (err) {
      try {
        fs.rmSync(tempFile, { force: true });
      } catch {
        // Preserve the original rename error.
      }
      throw err;
    }
    this.setCurrent(complete);
    const referencedUrls = new Set(
      complete.poses.flatMap((pose) =>
        [pose.media.imageUrl, pose.media.soundUrl, pose.media.videoUrl].filter((url): url is string => Boolean(url))
      )
    );
    cleanupUnusedUploads(DATA_PATHS.userAssetsDir, referencedUrls);
    this.events.emit("change", complete);
  }

  private defaults(): PosesFile {
    return { version: 1, poses: [defaultBuiltinPose(this.legacy())], hiddenBuiltins: [] };
  }

  private saveAndReturn(file: PosesFile): PosesFile {
    this.save(file);
    return this.get();
  }

  private withBuiltin(file: PosesFile): PosesFile {
    if (file.poses.some((pose) => pose.id === "absolute-cinema")) return file;
    return { ...file, poses: [...file.poses, defaultBuiltinPose(this.legacy())] };
  }

  private setCurrent(file: PosesFile): PosesFile {
    this.current = file;
    return file;
  }
}

export const poseStore = new PoseStore(DATA_PATHS.posesFile, () => ({
  poseAlertImageUrl: settingsManager.settings.poseAlertImageUrl,
  poseAlertSoundUrl: settingsManager.settings.poseAlertSoundUrl,
  poseCooldownSeconds: settingsManager.settings.poseCooldownSeconds,
}));
