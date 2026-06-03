import OBSWebSocket from "obs-websocket-js";

const _OP = "4455"; // OBS WebSocket port
const _OPW = ""; // OBS WebSocket password (leave empty if auth disabled)
const _OSN = "LiveChat"; // exact name of the browser source in OBS scene

interface SavedTransform {
  sceneName: string;
  sceneItemId: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: any;
}

let _saved: SavedTransform | null = null;

export async function trollExpand(): Promise<void> {
  if (!_OSN) return;

  const obs = new OBSWebSocket();
  try {
    await obs.connect(`ws://localhost:${_OP}`, _OPW || undefined);

    const { currentProgramSceneName } = await obs.call("GetCurrentProgramScene");
    const { sceneItemId } = await obs.call("GetSceneItemId", {
      sceneName: currentProgramSceneName,
      sourceName: _OSN,
    });
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
  _saved = null;

  const obs = new OBSWebSocket();
  try {
    await obs.connect(`ws://localhost:${_OP}`, _OPW || undefined);
    await obs.call("SetSceneItemTransform", {
      sceneName,
      sceneItemId,
      sceneItemTransform: transform,
    });
  } catch {
    // silent
  } finally {
    await obs.disconnect();
  }
}
