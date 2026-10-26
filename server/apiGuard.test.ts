import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { cookieName, createApiGuard, loadOrCreateToken, readCookie, requestToken, tokensMatch } from "./apiGuard.js";

const TOKEN = "a".repeat(64);
const guard = createApiGuard({ token: TOKEN, port: 3000 });

/** Runs a middleware against a fake request and reports the status it answered with (200 = next()). */
function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request> & { headers?: Record<string, string> }
) {
  const out = { status: 200, cookies: [] as string[] };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json() {},
    append(_name: string, value: string) {
      out.cookies.push(value);
    },
  };
  middleware(
    { method: "GET", path: "/", query: {}, headers: {}, ...req } as Request,
    res as unknown as Response,
    () => {}
  );
  return out;
}

test("loadOrCreateToken persists a generated token and prefers the environment one", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "token-"));
  const file = path.join(dir, "api-token.txt");
  const first = loadOrCreateToken(file);
  assert.equal(first.length, 64);
  assert.equal(loadOrCreateToken(file), first);
  assert.equal(loadOrCreateToken(file, "e".repeat(40)), "e".repeat(40));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("tokensMatch only accepts the exact token", () => {
  assert.equal(tokensMatch(TOKEN, TOKEN), true);
  assert.equal(tokensMatch("b".repeat(64), TOKEN), false);
  assert.equal(tokensMatch("", TOKEN), false);
  assert.equal(tokensMatch(undefined, TOKEN), false);
  assert.equal(tokensMatch(["x"], TOKEN), false);
});

test("requestToken reads the header first, then the per-port cookie", () => {
  assert.equal(requestToken({ "x-livechat-token": "h" }, 3000), "h");
  assert.equal(requestToken({ cookie: `a=1; ${cookieName(3000)}=c; b=2` }, 3000), "c");
  assert.equal(requestToken({ cookie: `${cookieName(3001)}=c` }, 3000), undefined);
  assert.equal(readCookie(undefined, "x"), undefined);
});

test("authGuard rejects missing/wrong tokens, accepts header or cookie, leaves /health open", () => {
  assert.equal(run(guard.authGuard, { path: "/settings" }).status, 401);
  assert.equal(run(guard.authGuard, { path: "/settings", headers: { "x-livechat-token": "nope" } }).status, 401);
  assert.equal(run(guard.authGuard, { path: "/settings", headers: { "x-livechat-token": TOKEN } }).status, 200);
  assert.equal(
    run(guard.authGuard, { path: "/settings", headers: { cookie: `${cookieName(3000)}=${TOKEN}` } }).status,
    200
  );
  assert.equal(run(guard.authGuard, { path: "/health" }).status, 200);
});

test("csrfGuard refuses cross-site and foreign-origin mutations only", () => {
  const post = (headers: Record<string, string>) => run(guard.csrfGuard, { method: "POST", headers }).status;
  assert.equal(post({}), 200);
  assert.equal(post({ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }), 200);
  assert.equal(post({ "sec-fetch-site": "none" }), 200);
  assert.equal(post({ "sec-fetch-site": "cross-site" }), 403);
  assert.equal(post({ "sec-fetch-site": "same-site" }), 403);
  assert.equal(post({ origin: "https://evil.example" }), 403);
  assert.equal(run(guard.csrfGuard, { method: "GET", headers: { origin: "https://evil.example" } }).status, 200);
});

test("cookieBootstrap plants the cookie only for a page load with a valid ?k=", () => {
  const cookie = run(guard.cookieBootstrap, { path: "/overlay", query: { k: TOKEN } as never }).cookies;
  assert.equal(cookie.length, 1);
  assert.match(cookie[0], /^lc_k_3000=a{64}; Path=\/; HttpOnly; SameSite=Strict/);
  assert.equal(run(guard.cookieBootstrap, { path: "/overlay", query: { k: "bad" } as never }).cookies.length, 0);
  assert.equal(run(guard.cookieBootstrap, { path: "/api/settings", query: { k: TOKEN } as never }).cookies.length, 0);
  assert.equal(run(guard.cookieBootstrap, { method: "POST", query: { k: TOKEN } as never }).cookies.length, 0);
});

test("socket guards check host, origin and token", () => {
  const allow = (headers: Record<string, string>) => {
    let result: boolean | undefined;
    guard.allowSocketRequest({ headers } as never, (_err, ok) => (result = ok));
    return result;
  };
  assert.equal(allow({ host: "localhost:3000", origin: "http://localhost:3000" }), true);
  assert.equal(allow({ host: "localhost:3000" }), true);
  assert.equal(allow({ host: "localhost:3000", origin: "https://evil.example" }), false);
  assert.equal(allow({ host: "evil.example:3000" }), false);

  const connect = (auth: Record<string, unknown>, headers: Record<string, string> = {}) => {
    let error: Error | undefined;
    guard.socketAuth({ handshake: { auth, headers } }, (err) => (error = err));
    return error === undefined;
  };
  assert.equal(connect({ token: TOKEN }), true);
  assert.equal(connect({}, { cookie: `${cookieName(3000)}=${TOKEN}` }), true);
  assert.equal(connect({}), false);
  assert.equal(connect({ token: "wrong" }), false);
});
