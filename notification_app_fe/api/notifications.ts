import axios from "axios";
import { Notification, NotificationType } from "../types";
import { FrontendLogger } from "../utils/logger";

const BASE_URL = "http://20.207.122.201/evaluation-service/notifications";
const AUTH_TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || "";

export interface FetchOptions {
  page?: number;
  limit?: number;
  notification_type?: NotificationType | "";
}

export async function fetchNotifications(
  options: FetchOptions = {}
): Promise<Notification[]> {
  const { page = 1, limit = 20, notification_type } = options;

  const params: Record<string, string | number> = { page, limit };
  if (notification_type) params.notification_type = notification_type;

  await FrontendLogger.info("api", `Fetching notifications page=${page} type=${notification_type || "all"}`);

  try {
    const res = await axios.get<{ notifications: Notification[] }>(BASE_URL, {
      params,
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });

    await FrontendLogger.info("api", `Fetched ${res.data.notifications.length} notifications`);
    return res.data.notifications;
  } catch (err) {
    await FrontendLogger.error("api", `Failed to fetch notifications: ${String(err)}`);
    throw err;
  }
}

// ─── Priority scoring (Stage 6 — client-side) ─────────────────────────────────

const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

export function getTopNPriority(notifications: Notification[], topN: number): Notification[] {
  return [...notifications]
    .sort((a, b) => {
      const scoreA = TYPE_WEIGHT[a.Type] * 1e12 + new Date(a.Timestamp).getTime();
      const scoreB = TYPE_WEIGHT[b.Type] * 1e12 + new Date(b.Timestamp).getTime();
      return scoreB - scoreA;
    })
    .slice(0, topN);
}
