import { redis, missingRedisConfig } from "../lib/redis.js";
import { methodNotAllowed } from "../lib/api-utils.js";

const KEY = "order-counter";

export default async function handler(req, res) {
  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured." });
  }
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  // redis.incr is atomic even under concurrent requests from multiple
  // customers ordering at the same moment — this is the real fix for the
  // "two customers could grab the same number" race from the old version.
  const next = await redis.incr(KEY);
  return res.status(200).json({ orderNo: next });
}
