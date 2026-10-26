import crypto from "crypto";
import fs from "fs";
import type { IncomingHttpHeaders, IncomingMessage } from "http";
import type { NextFunction, Request, Response } from "express";

/**
 * Local-only API protection. Binding to 127.0.0.1 does not stop a web page the streamer visits from
 * calling http://localhost:PORT from their browser (CSRF, WebSocket hijacking), so every /api request
 * and every Socket.IO connection must prove it knows a per-install secret, and mutating requests must
 * come from our own origin.
 *
 * The token is accepted from, in order: the `X-LiveChat-Token` header (Electron main, scripts), the
 * `lc_k_<port>` cookie (browsers) or the Socket.IO `auth.token` field. The cookie is planted by any page
 * load carrying `?k=<token>` (the OBS URLs and the Electron window), HttpOnly + SameSite=Strict so other
 * sites can neither read nor ride on it.
 */

export const TOKEN_HEADER = "x-livechat-token";

/** Cookies ignore ports: name it per port so two instances on localhost do not overwrite each other. */
export const cookieName = (port: number | string) => `lc_k_${port}`;

/** Reads the token from the file, or creates one. `fromEnv` (set by Electron) wins and is not stored. */
export function loadOrCreateToken(file: string, fromEnv?: string): string {
  if (fromEnv) return fromEnv;
  try {
    const existing = fs.readFileSync(file, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    // first launch: generate below
  }
  const token = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, token, { mode: 0o600 });
  return token;
}

/** Constant-time comparison (hashing first so the lengths always match). */
export function tokensMatch(given: unknown, expected: string): boolean {
  if (typeof given !== "string" || !given) return false;
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

export function requestToken(headers: IncomingHttpHeaders, port: number | string): string | undefined {
  const header = headers[TOKEN_HEADER];
  if (typeof header === "string" && header) return header;
  return readCookie(headers.cookie, cookieName(port));
}

export function createApiGuard(options: { token: string; port: number }) {
  const { token, port } = options;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

  const isAllowedHost = (host: string | undefined) => !!host && hosts.has(host.toLowerCase());
  // No Origin = not a browser cross-site request (Electron main, curl): the token still applies.
  const isAllowedOrigin = (origin: string | undefined) => !origin || origins.has(origin.toLowerCase());

  /** A page load with a valid `?k=` plants the cookie so every later fetch / socket / <video> carries it. */
  function cookieBootstrap(req: Request, res: Response, next: NextFunction) {
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      !req.path.startsWith("/api/") &&
      tokensMatch(req.query.k, token)
    ) {
      res.append(
        "Set-Cookie",
        `${cookieName(port)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 365}`
      );
    }
    next();
  }

  /** Mutating requests must be same-origin: a cross-site form or fetch is refused even with a stolen cookie. */
  function csrfGuard(req: Request, res: Response, next: NextFunction) {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    const site = req.headers["sec-fetch-site"];
    if (typeof site === "string" && site !== "same-origin" && site !== "none") {
      return void res.status(403).json({ error: "Cross-site request refused" });
    }
    if (!isAllowedOrigin(req.headers.origin)) {
      return void res.status(403).json({ error: "Cross-origin request refused" });
    }
    next();
  }

  /** Mounted on /api. The health ping stays open: Electron polls it before it has anything to prove. */
  function authGuard(req: Request, res: Response, next: NextFunction) {
    if (req.path === "/health") return next();
    if (tokensMatch(requestToken(req.headers, port), token)) return next();
    res.status(401).json({ error: "Unauthorized" });
  }

  /** Socket.IO `allowRequest`: wrong Host (DNS rebinding) or foreign Origin never gets a socket. */
  function allowSocketRequest(
    req: IncomingMessage,
    callback: (err: string | null | undefined, success: boolean) => void
  ) {
    if (!isAllowedHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
      return callback("Forbidden origin", false);
    }
    callback(null, true);
  }

  /** Socket.IO middleware: `auth.token`, or the same header / cookie as the REST API. */
  function socketAuth(
    socket: { handshake: { auth?: Record<string, unknown>; headers: IncomingHttpHeaders } },
    next: (err?: Error) => void
  ) {
    const given = socket.handshake.auth?.token ?? requestToken(socket.handshake.headers, port);
    if (tokensMatch(given, token)) return next();
    next(new Error("unauthorized"));
  }

  return { isAllowedHost, isAllowedOrigin, cookieBootstrap, csrfGuard, authGuard, allowSocketRequest, socketAuth };
}
