import { Router } from "express";
import {
  getAllNotifications,
  getPriorityNotifications,
} from "../controller/notificationController";

const router = Router();

// GET /api/v1/notifications — all notifications with optional type filter & pagination
router.get("/", getAllNotifications);

// GET /api/v1/notifications/priority — top-N priority notifications (Stage 6)
router.get("/priority", getPriorityNotifications);

export default router;
