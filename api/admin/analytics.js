// GET /api/admin/analytics?pin=...&range=today|yesterday|week|month|quarter|year|custom
//                          [&from=YYYY-MM-DD&to=YYYY-MM-DD]   (custom range only)
//
// One combined endpoint (sales summary + time breakdown + item performance +
// category performance together) rather than three separate ones — the
// Admin analytics screen needs all of it at once, and the spec explicitly
// allows a single endpoint when that's the cleaner fit.
//
// Reuses the same PIN-via-query-string check as GET /api/admin/orders (GET
// requests can't carry a body), and the same getAllOrders() Redis read the
// Orders section already uses — no second data source, no new database.
//
// All the actual date-range and aggregation math lives in lib/analytics.js,
// kept isolated/pure so it's unit-testable and easy to swap for
// pre-aggregated data later if order volume ever grows enough to need it.

import { missingRedisConfig } from "../../lib/redis.js";
import { methodNotAllowed } from "../../lib/api-utils.js";
import { getAllOrders } from "../../lib/orders-store.js";
import { resolveRange, computeAnalytics } from "../../lib/analytics.js";

const VALID_RANGES = new Set(["today", "yesterday", "week", "month", "quarter", "year", "custom"]);

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

  const range = req.query.range || "today";
  if (!VALID_RANGES.has(range)) {
    return res.status(400).json({ error: `Invalid range "${range}"` });
  }

  let resolved;
  try {
    resolved = resolveRange(range, req.query.from, req.query.to);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const orders = await getAllOrders();
  const result = computeAnalytics(orders, resolved);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    range,
    from: resolved.fromMs,
    to: resolved.toMs,
    groupBy: resolved.groupBy,
    ...result,
  });
}
