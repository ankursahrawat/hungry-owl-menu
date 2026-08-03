import { redis, missingRedisConfig } from "../lib/redis.js";
import { methodNotAllowed, requireAdmin } from "../lib/api-utils.js";

const KEY = "order-counter";

export default async function handler(req, res) {
  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured." });
  }

  // POST /api/order-number  → increment and return next order number (customer)
  if (req.method === "POST") {
    const next = await redis.incr(KEY);
    return res.status(200).json({ orderNo: next });
  }

  // DELETE /api/order-number  → reset counter to 0 (admin only)
  if (req.method === "DELETE") {
    const body = requireAdmin(req, res);
    if (!body) return;
    await redis.set(KEY, 0);
    return res.status(200).json({ ok: true, reset: true });
  }

  return methodNotAllowed(res, ["POST", "DELETE"]);
}
