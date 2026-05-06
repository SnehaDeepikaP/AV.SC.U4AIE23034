import express from "express";
import cors from "cors";
import { config } from "./config";
import { Logger } from "./middleware/logger";
import notificationRoutes from "./route/notificationRoutes";

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

// ─── Request logging middleware ────────────────────────────────────────────────
app.use(async (req, _res, next) => {
  await Logger.info("middleware", `${req.method} ${req.path} — incoming request`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/v1/notifications", notificationRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use(async (req, res) => {
  await Logger.warn("route", `404 — Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.path} not found` },
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(config.port, async () => {
  await Logger.info("service", `Backend server started on port ${config.port}`);
  console.log(`[Server] Running on http://localhost:${config.port}`);
});

export default app;
