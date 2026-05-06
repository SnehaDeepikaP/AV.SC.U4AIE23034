import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  authToken: process.env.AUTH_TOKEN || "",
  notificationApiUrl:
    process.env.NOTIFICATION_API_URL ||
    "http://20.207.122.201/evaluation-service/notifications",
  databaseUrl: process.env.DATABASE_URL || "",
};

if (!config.authToken) {
  console.warn("[Config] WARNING: AUTH_TOKEN is not set. API calls will fail.");
}
