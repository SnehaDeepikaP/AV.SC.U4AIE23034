import axios from "axios";
import { Notification, NotificationApiResponse, NotificationType } from "../types";
import { config } from "../config";
import { Logger } from "../middleware/logger";

interface FetchOptions {
  page?: number;
  limit?: number;
  notification_type?: NotificationType | "";
}

/**
 * Fetch notifications from the external evaluation API.
 * Handles auth, pagination, and type filtering.
 */
export async function fetchNotifications(
  options: FetchOptions = {}
): Promise<Notification[]> {
  const { page = 1, limit = 20, notification_type } = options;

  const params: Record<string, string | number> = { page, limit };
  if (notification_type) {
    params.notification_type = notification_type;
  }

  await Logger.info(
    "service",
    `Fetching notifications — page=${page} limit=${limit} type=${notification_type || "all"}`
  );

  try {
    const response = await axios.get<NotificationApiResponse>(
      config.notificationApiUrl,
      {
        params,
        headers: {
          Authorization: `Bearer ${config.authToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      }
    );

    await Logger.info(
      "service",
      `Fetched ${response.data.notifications.length} notifications successfully`
    );

    return response.data.notifications;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      await Logger.error(
        "service",
        `Failed to fetch notifications: ${err.response?.status} — ${err.message}`
      );
      throw new Error(
        `Notification API error: ${err.response?.status ?? "NETWORK_ERROR"}`
      );
    }
    await Logger.fatal("service", `Unexpected error fetching notifications: ${String(err)}`);
    throw err;
  }
}

// ─── Priority Scoring (Stage 6) ───────────────────────────────────────────────

const TYPE_WEIGHT: Record<NotificationType, number> = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function priorityScore(notification: Notification): number {
  const weight = TYPE_WEIGHT[notification.Type] ?? 0;
  const timestampMs = new Date(notification.Timestamp).getTime();
  // Large multiplier ensures type always dominates recency
  return weight * 1_000_000_000_000 + timestampMs;
}

/**
 * Returns the top-N notifications by priority using a min-heap.
 * Priority = type weight (Placement > Result > Event) + recency tiebreaker.
 *
 * Time Complexity:  O(N log n) — N = all notifications, n = topN
 * Space Complexity: O(n)
 */
export function getTopNPriorityNotifications(
  notifications: Notification[],
  topN: number
): Notification[] {
  if (topN <= 0) return [];

  type HeapEntry = [number, Notification];
  const heap: HeapEntry[] = [];

  const swap = (i: number, j: number) => {
    [heap[i], heap[j]] = [heap[j], heap[i]];
  };

  const heapifyUp = (i: number) => {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (heap[parent][0] <= heap[i][0]) break;
      swap(parent, i);
      i = parent;
    }
  };

  const heapifyDown = (i: number) => {
    const n = heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && heap[l][0] < heap[smallest][0]) smallest = l;
      if (r < n && heap[r][0] < heap[smallest][0]) smallest = r;
      if (smallest === i) break;
      swap(smallest, i);
      i = smallest;
    }
  };

  for (const notification of notifications) {
    const score = priorityScore(notification);
    if (heap.length < topN) {
      heap.push([score, notification]);
      heapifyUp(heap.length - 1);
    } else if (score > heap[0][0]) {
      heap[0] = [score, notification];
      heapifyDown(0);
    }
  }

  // Return sorted descending (highest priority first)
  return heap.sort((a, b) => b[0] - a[0]).map(([, n]) => n);
}
