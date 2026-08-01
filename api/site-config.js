import { redis, missingRedisConfig } from "../lib/redis.js";
import { requireAdmin, methodNotAllowed } from "../lib/api-utils.js";
import { DEFAULT_SITE_CONFIG } from "../lib/default-data.js";

const KEY = "site-config";

export default async function handler(req, res) {
  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured. Set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN in Vercel." });
  }

  if (req.method === "GET") {
    let cfg = await redis.get(KEY);
    cfg = cfg ? (typeof cfg === "string" ? JSON.parse(cfg) : cfg) : {};
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ...DEFAULT_SITE_CONFIG, ...cfg });
  }

  if (req.method === "POST") {
    const body = requireAdmin(req, res);
    if (!body) return;
    const { pin, ...cfg } = body;
    const merged = { ...DEFAULT_SITE_CONFIG, ...cfg };
    await redis.set(KEY, JSON.stringify(merged));
    return res.status(200).json({ ok: true });
  }

  return methodNotAllowed(res, ["GET", "POST"]);
}
