import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

type Stack = "backend" | "frontend";
type Level = "debug" | "info" | "warn" | "error" | "fatal";

/** Backend-only packages */
type BackendPackage =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service";

/** Frontend-only packages */
type FrontendPackage = "api" | "component" | "hook" | "page" | "state" | "style";

/** Shared packages */
type SharedPackage = "auth" | "config" | "middleware" | "utils";

type Package = BackendPackage | FrontendPackage | SharedPackage;

interface LogPayload {
  stack: Stack;
  level: Level;
  package: Package;
  message: string;
}

interface LogResponse {
  logID: string;
  message: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LOG_API_URL = "http://20.207.122.201/evaluation-service/logs";

/** Auth token — set via configure() before calling Log() */
let authToken: string = process.env.AUTH_TOKEN || "";

/**
 * Configure the logging middleware with auth credentials.
 * Must be called once before using Log().
 */
export function configure(token: string): void {
  if (!token || token.trim() === "") {
    throw new Error("[Logger] Token must be a non-empty string.");
  }
  authToken = token.trim();
}

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_STACKS: Stack[] = ["backend", "frontend"];
const VALID_LEVELS: Level[] = ["debug", "info", "warn", "error", "fatal"];
const VALID_BACKEND_PACKAGES: BackendPackage[] = [
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
];
const VALID_FRONTEND_PACKAGES: FrontendPackage[] = [
  "api",
  "component",
  "hook",
  "page",
  "state",
  "style",
];
const VALID_SHARED_PACKAGES: SharedPackage[] = [
  "auth",
  "config",
  "middleware",
  "utils",
];

function isValidPackageForStack(pkg: string, stack: Stack): boolean {
  const shared = VALID_SHARED_PACKAGES as string[];
  if (shared.includes(pkg)) return true;
  if (stack === "backend") {
    return (VALID_BACKEND_PACKAGES as string[]).includes(pkg);
  }
  return (VALID_FRONTEND_PACKAGES as string[]).includes(pkg);
}

// ─── Core Log function ────────────────────────────────────────────────────────

/**
 * Log(stack, level, package, message)
 *
 * Sends a structured log entry to the Affordmed evaluation server.
 * All parameters are validated before the API call is made.
 *
 * @param stack   - "backend" or "frontend"
 * @param level   - "debug" | "info" | "warn" | "error" | "fatal"
 * @param pkg     - The package/layer that generated the log
 * @param message - Descriptive message explaining the event
 * @returns       - Promise resolving to the server response (logID + message)
 */
export async function Log(
  stack: Stack,
  level: Level,
  pkg: Package,
  message: string
): Promise<LogResponse | null> {
  // ── Parameter validation ──────────────────────────────────────────────────
  if (!VALID_STACKS.includes(stack)) {
    console.error(
      `[Logger] Invalid stack "${stack}". Must be one of: ${VALID_STACKS.join(", ")}`
    );
    return null;
  }

  if (!VALID_LEVELS.includes(level)) {
    console.error(
      `[Logger] Invalid level "${level}". Must be one of: ${VALID_LEVELS.join(", ")}`
    );
    return null;
  }

  if (!isValidPackageForStack(pkg, stack)) {
    console.error(
      `[Logger] Package "${pkg}" is not valid for stack "${stack}".`
    );
    return null;
  }

  if (!message || message.trim() === "") {
    console.error("[Logger] Message must be a non-empty string.");
    return null;
  }

  if (!authToken) {
    console.error(
      "[Logger] Auth token not configured. Call configure(token) first."
    );
    return null;
  }

  // ── Build payload ─────────────────────────────────────────────────────────
  const payload: LogPayload = {
    stack,
    level,
    package: pkg,
    message: message.trim(),
  };

  // ── Fire & handle API call ────────────────────────────────────────────────
  try {
    const response = await axios.post<LogResponse>(LOG_API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      timeout: 10_000, // 10 s timeout
    });

    return response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      console.error(
        `[Logger] API call failed: ${err.response?.status ?? "NETWORK_ERROR"} — ${
          err.response?.data?.message ?? err.message
        }`
      );
    } else {
      console.error("[Logger] Unexpected error while logging:", err);
    }
    return null;
  }
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export const Logger = {
  debug: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "debug", pkg, message),
  info: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "info", pkg, message),
  warn: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "warn", pkg, message),
  error: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "error", pkg, message),
  fatal: (stack: Stack, pkg: Package, message: string) =>
    Log(stack, "fatal", pkg, message),
};

export default Log;
