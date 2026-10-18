import OBSWebSocket from "obs-websocket-js";
import { env } from "./env.js";
import { logger } from "./logger.js";

const _OP = "4455";
const _OPW = "";

interface SavedTransform {
  sceneName: string;
  sceneItemId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: any;
}

let _saved: SavedTransform | null = null;

async function findOverlaySourceId(obs: OBSWebSocket, sceneName: string): Promise<number | null> {
  const { sceneItems } = await obs.call("GetSceneItemList", { sceneName });

  for (const item of sceneItems) {
    if (item.inputKind !== "browser_source") continue;
    try {
      const { inputSettings } = await obs.call("GetInputSettings", {
        inputName: item.sourceName as string,
      });
      const url = (inputSettings as Record<string, unknown>).url as string | undefined;
      if (url?.includes("/overlay") && url.includes(`:${env.PORT}`)) {
        return item.sceneItemId as number;
      }
    } catch {
      // skip inaccessible sources
    }
  }
  return null;
}

/** Stretches the overlay source to the full canvas. Resolves false if it was already expanded or failed. */
// Compact summary for logs: enough to rebuild the overlay layout by hand.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function describe(t: any) {
  return {
    boundsType: t.boundsType,
    x: t.positionX,
    y: t.positionY,
    scaleX: t.scaleX,
    scaleY: t.scaleY,
    w: t.width,
    h: t.height,
  };
}

export async function trollExpand(): Promise<boolean> {
  if (_saved) return false; // already expanded (e.g. troll and pose alert at once) — don't overwrite the original transform
  const obs = new OBSWebSocket();
  try {
    await obs.connect(`ws://localhost:${_OP}`, _OPW || undefined);

    const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
    const sceneItemId = await findOverlaySourceId(obs, currentProgramSceneName);
    if (sceneItemId === null) return false;

    const { sceneItemTransform } = await obs.call("GetSceneItemTransform", {
      sceneName: currentProgramSceneName,
      sceneItemId,
    });
    const { baseWidth, baseHeight } = await obs.call("GetVideoSettings");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _saved = { sceneName: currentProgramSceneName, sceneItemId, transform: sceneItemTransform as any };
    logger.info({ sceneItemId, saved: describe(sceneItemTransform) }, "OBS overlay expanded");

    await obs.call("SetSceneItemTransform", {
      sceneName: currentProgramSceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        boundsType: "OBS_BOUNDS_STRETCH",
        boundsWidth: baseWidth,
        boundsHeight: baseHeight,
      },
    });
    return true;
  } catch (err) {
    // troll continues without resize
    logger.warn({ err: (err as Error).message }, "OBS overlay expand failed");
    return false;
  } finally {
    await obs.disconnect();
  }
}

export async function trollRestore(): Promise<void> {
  if (!_saved) return;
  const { sceneName, sceneItemId, transform } = _saved;

  const obs = new OBSWebSocket();
  try {
    await obs.connect(`ws://localhost:${_OP}`, _OPW || undefined);
    await obs.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        ...transform,
        // Sources without a bounding box report 0, but obs-websocket rejects bounds below 1 (error 402)
        boundsWidth: Math.max(1, transform.boundsWidth),
        boundsHeight: Math.max(1, transform.boundsHeight),
      },
    });
    logger.info({ sceneItemId, restored: describe(transform) }, "OBS overlay restored");
    _saved = null;
  } catch (err) {
    // _saved preserved for retry
    logger.warn({ err: (err as Error).message }, "OBS overlay restore failed");
  } finally {
    await obs.disconnect();
  }
}
