import { missingRedisConfig } from "../lib/redis.js";
import { methodNotAllowed } from "../lib/api-utils.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    databaseConfigured: !missingRedisConfig(),
    telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    adminPinConfigured: !!process.env.ADMIN_PIN,
  });
}
