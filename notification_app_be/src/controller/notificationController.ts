import { Request, Response } from "express";
import { fetchNotifications, getTopNPriorityNotifications } from "../service/notificationService";
import { Logger } from "../middleware/logger";
import { NotificationType } from "../types";

/** GET /api/v1/notifications */
export async function getAllNotifications(req: Request, res: Response): Promise<void> {
  await Logger.info("controller", "GET /api/v1/notifications — request received");

  try {
    const page  = parseInt(String(req.query.page  || "1"),  10);
    const limit = parseInt(String(req.query.limit || "20"), 10);
    const type  = req.query.notification_type as NotificationType | undefined;

    const notifications = await fetchNotifications({ page, limit, notification_type: type });

    res.status(200).json({
      success: true,
      data: {
        notifications,
        pagination: {
          page,
          limit,
          total: notifications.length,
          totalPages: Math.ceil(notifications.length / limit),
        },
      },
    });

    await Logger.info("controller", `Returned ${notifications.length} notifications`);
  } catch (err) {
    await Logger.error("controller", `Failed to get notifications: ${(err as Error).message}`);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: (err as Error).message },
    });
  }
}

/** GET /api/v1/notifications/priority?limit=10 */
export async function getPriorityNotifications(req: Request, res: Response): Promise<void> {
  await Logger.info("controller", "GET /api/v1/notifications/priority — request received");

  try {
    const topN  = parseInt(String(req.query.limit || "10"), 10);
    const type  = req.query.notification_type as NotificationType | undefined;

    // Fetch a larger pool to run priority algorithm over
    const all = await fetchNotifications({ page: 1, limit: 100, notification_type: type });
    const priority = getTopNPriorityNotifications(all, topN);

    res.status(200).json({
      success: true,
      data: {
        notifications: priority,
        topN,
      },
    });

    await Logger.info("controller", `Returned top-${topN} priority notifications`);
  } catch (err) {
    await Logger.error("controller", `Failed to get priority notifications: ${(err as Error).message}`);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: (err as Error).message },
    });
  }
}
