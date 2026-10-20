import OBSWebSocket from "obs-websocket-js";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { settingsManager } from "./settingsManager.js";

// obs-websocket close code sent when the password is wrong
const OBS_AUTH_FAILED_CODE = 4009;
const TEST_TIMEOUT_MS = 3000;

// Read at connect time so a port/password change in the dashboard applies without a restart
function obsUrl() {
  return `ws://localhost:${settingsManager.settings.obsWebsocketPort}`;
}

function obsPassword() {
  return settingsManager.settings.obsWebsocketPassword || undefined;
}

export type ObsTestResult =
  | { ok: true; obsVersion: string }
  | { ok: false; errorCode: "unreachable" | "auth_failed" | "other"; error: string };

/** Maps a failed obs-websocket connect() error to a code the UI can localize. */
export function classifyObsError(err: unknown): "unreachable" | "auth_failed" | "other" {
  const code = (err as { code?: unknown })?.code;
  if (code === OBS_AUTH_FAILED_CODE) return "auth_failed";
  // Refused / timed out / not found: nothing (or nothing OBS) is listening on that port.
  // Node reports these via `code`, the browser WebSocket via a generic close code (1006 etc.)
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH" ||
    code === "TEST_TIMEOUT" ||
    code === 1006 ||
    code === -1
  ) {
    return "unreachable";
  }
  return "other";
}

/** Tries a connection with the given port/password (defaults: stored settings). Never throws. */
export async function testObsConnection(opts: { port?: number; password?: string } = {}): Promise<ObsTestResult> {
  const port = opts.port ?? settingsManager.settings.obsWebsocketPort;
  const password = opts.password ?? obsPassword();
  const obs = new OBSWebSocket();
  let timer: NodeJS.Timeout | undefined;
  try {
    // connect() has no timeout of its own: race it so the test button never hangs
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error("Timed out"), { code: "TEST_TIMEOUT" })),
        TEST_TIMEOUT_MS
      );
    });
    await Promise.race([obs.connect(`ws://localhost:${port}`, password), timeout]);
    const { obsVersion } = await obs.call("GetVersion");
    return { ok: true, obsVersion };
  } catch (err) {
    return { ok: false, errorCode: classifyObsError(err), error: (err as Error).message };
  } finally {
    clearTimeout(timer);
    await obs.disconnect().catch(() => {});
  }
}

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
    await obs.connect(obsUrl(), obsPassword());

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
    await obs.connect(obsUrl(), obsPassword());
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
