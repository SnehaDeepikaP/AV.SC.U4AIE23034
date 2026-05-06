const LOG_API_URL = "http://20.207.122.201/evaluation-service/logs";
const AUTH_TOKEN  = process.env.NEXT_PUBLIC_AUTH_TOKEN || "";

type Level   = "debug" | "info" | "warn" | "error" | "fatal";
type Package = "api" | "component" | "hook" | "page" | "state" | "style" | "auth" | "config" | "middleware" | "utils";

export async function Log(
  level: Level,
  pkg: Package,
  message: string
): Promise<void> {
  try {
    await fetch(LOG_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({ stack: "frontend", level, package: pkg, message }),
    });
  } catch {
    // Log failures are silent — never break the UI
  }
}

export const FrontendLogger = {
  debug: (pkg: Package, msg: string) => Log("debug", pkg, msg),
  info:  (pkg: Package, msg: string) => Log("info",  pkg, msg),
  warn:  (pkg: Package, msg: string) => Log("warn",  pkg, msg),
  error: (pkg: Package, msg: string) => Log("error", pkg, msg),
  fatal: (pkg: Package, msg: string) => Log("fatal", pkg, msg),
};
