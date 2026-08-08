// GET /api/admin/orders            → list recent orders, newest first
// GET /api/admin/orders?orderNo=…  → a single order's full detail
//
// Reuses the existing admin PIN mechanism (same ADMIN_PIN env var used by
// requireAdmin() elsewhere in this project). GET requests can't carry a
// JSON body the way POST does, so the PIN is passed as a query string param
// here instead — same check, same env var, just adapted for GET.

import { redis, missingRedisConfig } from "../../lib/redis.js";
import { methodNotAllowed } from "../../lib/api-utils.js";

const INDEX_KEY = "orders:index";
const MAX_KEPT  = 1000;
const orderKey  = (orderNo) => `order:${orderNo}`;

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  const expected = process.env.ADMIN_PIN;
  if (!expected) {
    return res.status(500).json({ error: "ADMIN_PIN is not set in Vercel env vars." });
  }
  if (req.query.pin !== expected) {
    return res.status(401).json({ error: "Wrong PIN" });
  }

  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured." });
  }

  res.setHeader("Cache-Control", "no-store");

  // ---- single order detail ----
  if (req.query.orderNo) {
    const raw = await redis.get(orderKey(req.query.orderNo));
    if (!raw) return res.status(404).json({ error: "Order not found" });
    const order = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res.status(200).json({ order });
  }

  // ---- recent orders list, newest first ----
  const orderNos = await redis.lrange(INDEX_KEY, 0, MAX_KEPT - 1);
  if (!orderNos.length) return res.status(200).json({ orders: [] });

  const raw = await redis.mget(...orderNos.map(orderKey));
  const orders = raw
    .map(r => (r ? (typeof r === "string" ? JSON.parse(r) : r) : null))
    .filter(Boolean);

  return res.status(200).json({ orders });
}
