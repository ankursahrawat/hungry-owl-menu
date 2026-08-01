import { redis, missingRedisConfig } from "../lib/redis.js";
import { requireAdmin, methodNotAllowed } from "../lib/api-utils.js";
import { DEFAULT_MENU } from "../lib/default-data.js";

const KEY = "menu-data";

export default async function handler(req, res) {
  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured. Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in Vercel." });
  }

  if (req.method === "GET") {
    let menu = await redis.get(KEY);
    if (!menu) {
      menu = DEFAULT_MENU;
      await redis.set(KEY, JSON.stringify(menu));
    } else if (typeof menu === "string") {
      menu = JSON.parse(menu);
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(menu);
  }

  if (req.method === "POST") {
    const body = requireAdmin(req, res);
    if (!body) return; // requireAdmin already sent the error response
    if (!body.menu || !Array.isArray(body.menu.sections)) {
      return res.status(400).json({ error: "Missing or invalid menu payload" });
    }
    await redis.set(KEY, JSON.stringify(body.menu));
    return res.status(200).json({ ok: true });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
}
