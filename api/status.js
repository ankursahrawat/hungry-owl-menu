import { missingRedisConfig } from "../lib/redis.js";
import { methodNotAllowed } from "../lib/api-utils.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    databaseConfigured: !missingRedisConfig(),
    whatsappConfigured: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TO),
    adminPinConfigured: !!process.env.ADMIN_PIN,
  });
}
