import OBSWebSocket from "obs-websocket-js";
import { env } from "./env.js";

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

export async function trollExpand(): Promise<void> {
  const obs = new OBSWebSocket();
  try {
    await obs.connect(`ws://localhost:${_OP}`, _OPW || undefined);

    const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
    const sceneItemId = await findOverlaySourceId(obs, currentProgramSceneName);
    if (sceneItemId === null) return;

    const { sceneItemTransform } = await obs.call("GetSceneItemTransform", {
      sceneName: currentProgramSceneName,
      sceneItemId,
    });
    const { baseWidth, baseHeight } = await obs.call("GetVideoSettings");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _saved = { sceneName: currentProgramSceneName, sceneItemId, transform: sceneItemTransform as any };

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
  } catch {
    // silent — troll continues without resize
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
      sceneItemTransform: transform,
    });
    _saved = null;
  } catch {
    // silent — _saved preserved for retry
  } finally {
    await obs.disconnect();
  }
}
