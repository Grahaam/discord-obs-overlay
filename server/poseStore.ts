import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { z } from "zod";
import type { BodyPart, Pose, PosesFile, PoseMedia } from "../src/types.js";
import { DATA_PATHS } from "./paths.js";
import { settingsManager } from "./settingsManager.js";
import { logger } from "./logger.js";
import { cleanupUnusedUploads } from "./userAssets.js";

const bodyPartSchema = z.enum(["arms", "legs", "head"]);
const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  visibility: z.number().min(0).max(1),
});

const poseMediaSchema = z
  .object({
    type: z.enum(["image", "video"]),
    imageUrl: z.string().optional(),
    soundUrl: z.string().optional(),
    videoUrl: z.string().optional(),
    volume: z.number().min(0).max(1),
    durationSeconds: z.number().positive().optional(),
    maxDurationSeconds: z.number().min(5).max(120),
    fullscreen: z.boolean(),
  })
  .superRefine((media, ctx) => {
    if (media.type === "image" && media.videoUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Image media cannot include videoUrl", path: ["videoUrl"] });
    }
    if (media.type === "video" && media.imageUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Video media cannot include imageUrl", path: ["imageUrl"] });
    }
  });

const poseSchema = z.object({
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
});

export const posesFileSchema = z.object({
  version: z.literal(1),
  poses: z.array(poseSchema),
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

export function visiblePoses(file: PosesFile): Pose[] {
  return file.poses.filter((pose) => !pose.builtinId || !file.hiddenBuiltins.includes(pose.builtinId));
}

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
      const parsed = posesFileSchema.parse(JSON.parse(fs.readFileSync(this.file, "utf8")));
      const complete = this.withBuiltin(parsed);
      if (complete.poses.length !== parsed.poses.length) {
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
