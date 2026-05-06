import { useState, useEffect, useCallback } from "react";
import { fetchNotifications, FetchOptions, getTopNPriority } from "../api/notifications";
import { Notification, NotificationType } from "../types";
import { FrontendLogger } from "../utils/logger";

interface UseNotificationsReturn {
  notifications: Notification[];
  priorityNotifications: Notification[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  typeFilter: NotificationType | "";
  topN: number;
  setPage: (p: number) => void;
  setTypeFilter: (t: NotificationType | "") => void;
  setTopN: (n: number) => void;
  markAsRead: (id: string) => void;
  refetch: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications]         = useState<Notification[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState<string | null>(null);
  const [page, setPage]                           = useState(1);
  const [totalPages, setTotalPages]               = useState(1);
  const [typeFilter, setTypeFilter]               = useState<NotificationType | "">("");
  const [topN, setTopN]                           = useState(10);
  const [readIds, setReadIds]                     = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    await FrontendLogger.info("hook", `Loading notifications page=${page} filter=${typeFilter || "all"}`);
    try {
      const opts: FetchOptions = { page, limit: 20 };
      if (typeFilter) opts.notification_type = typeFilter;

      const data = await fetchNotifications(opts);

      // Merge read state from local tracking
      const enriched = data.map((n) => ({
        ...n,
        isRead: readIds.has(n.ID) ? true : n.isRead ?? false,
      }));

      setNotifications(enriched);
      setTotalPages(Math.max(1, Math.ceil(data.length / 20)));
      await FrontendLogger.info("hook", `Loaded ${data.length} notifications`);
    } catch (err) {
      const msg = String(err);
      setError("Failed to load notifications. Please try again.");
      await FrontendLogger.error("hook", `Error loading notifications: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, readIds]);

  useEffect(() => { load(); }, [load]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => new Set([...prev, id]));
    setNotifications((prev) =>
      prev.map((n) => (n.ID === id ? { ...n, isRead: true } : n))
    );
    FrontendLogger.info("hook", `Notification ${id} marked as read`);
  }, []);

  const priorityNotifications = getTopNPriority(
    notifications.filter((n) => !n.isRead),
    topN
  );

  return {
    notifications,
    priorityNotifications,
    loading,
    error,
    page,
    totalPages,
    typeFilter,
    topN,
    setPage,
    setTypeFilter,
    setTopN,
    markAsRead,
    refetch: load,
  };
}
