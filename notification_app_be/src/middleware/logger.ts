import axios from "axios";
import { config } from "../config";

type Stack = "backend" | "frontend";
type Level = "debug" | "info" | "warn" | "error" | "fatal";
type Package =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service"
  | "auth"
  | "config"
  | "middleware"
  | "utils";

const LOG_API_URL = "http://20.207.122.201/evaluation-service/logs";

/**
 * Log(stack, level, package, message)
 * Reusable logging function — sends structured logs to the evaluation server.
 */
export async function Log(
  stack: Stack,
  level: Level,
  pkg: Package,
  message: string
): Promise<void> {
  try {
    await axios.post(
      LOG_API_URL,
      { stack, level, package: pkg, message },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.authToken}`,
        },
        timeout: 8_000,
      }
    );
  } catch (err) {
    // Log failures must never crash the app
    console.error("[Logger] Failed to send log:", (err as Error).message);
  }
}

export const Logger = {
  debug: (pkg: Package, msg: string) => Log("backend", "debug", pkg, msg),
  info: (pkg: Package, msg: string) => Log("backend", "info", pkg, msg),
  warn: (pkg: Package, msg: string) => Log("backend", "warn", pkg, msg),
  error: (pkg: Package, msg: string) => Log("backend", "error", pkg, msg),
  fatal: (pkg: Package, msg: string) => Log("backend", "fatal", pkg, msg),
};
