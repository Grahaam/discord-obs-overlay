import pino from "pino";
import { env } from "./env.js";
import { serverLogManager } from "./serverLogManager.js";

const isDev = env.NODE_ENV === "development";

const _pino = pino({
  level: isDev ? "debug" : "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "HH:MM:ss Z",
    },
  },
});

function capture(level: "warn" | "error" | "fatal", arg1: object | string, arg2?: string) {
  const msg = typeof arg1 === "string" ? arg1 : (arg2 ?? "");
  const data = typeof arg1 === "object" ? arg1 : undefined;
  serverLogManager.add(level, msg, data);
}

export const logger = {
  debug: (arg1: object | string, arg2?: string) => {
    if (typeof arg1 === "string") _pino.debug(arg1);
    else _pino.debug(arg1, arg2);
  },
  info: (arg1: object | string, arg2?: string) => {
    if (typeof arg1 === "string") _pino.info(arg1);
    else _pino.info(arg1, arg2);
  },
  warn: (arg1: object | string, arg2?: string) => {
    if (typeof arg1 === "string") _pino.warn(arg1);
    else _pino.warn(arg1, arg2);
    capture("warn", arg1, arg2);
  },
  error: (arg1: object | string, arg2?: string) => {
    if (typeof arg1 === "string") _pino.error(arg1);
    else _pino.error(arg1, arg2);
    capture("error", arg1, arg2);
  },
  fatal: (arg1: object | string, arg2?: string) => {
    if (typeof arg1 === "string") _pino.fatal(arg1);
    else _pino.fatal(arg1, arg2);
    capture("fatal", arg1, arg2);
  },
};
