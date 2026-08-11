// GET   /api/staff/orders   → only active orders (NEW/PREPARING/READY),
//                             newest first, trimmed to what the Staff
//                             screen actually needs (no financial breakdown,
//                             no dummy flag exposed).
// PATCH /api/staff/orders   → advance ONE step in the strict staff workflow
//         body: { pin, orderNo, status }
//
// This intentionally does NOT reuse GET /api/admin/orders — that endpoint
// returns the full order history (up to 1000 records) with the complete
// financial breakdown, which is exactly what section 19 of the Batch 4 spec
// says the Staff screen should avoid pulling down. It does reuse the same
// getAllOrders() Redis helper under the hood (single source of truth), just
// filters/trims the result differently for this smaller, staff-specific need.
//
// Status transitions here are intentionally stricter than Admin's: Staff
// can only move an order one step forward through NEW -> PREPARING ->
// READY -> DELIVERED. Admin's own endpoint (api/admin/orders.js) keeps its
// separate, wider override transition map — the two are not shared, by design.

import { redis, missingRedisConfig } from "../../lib/redis.js";
import { methodNotAllowed, requireStaff } from "../../lib/api-utils.js";
import { getAllOrders } from "../../lib/orders-store.js";

const orderKey = (orderNo) => `order:${orderNo}`;
const ACTIVE_STATUSES = new Set(["NEW", "PREPARING", "READY"]);

// The one and only forward step Staff is allowed to make from each status.
const STAFF_ALLOWED_TRANSITIONS = {
  NEW:       "PREPARING",
  PREPARING: "READY",
  READY:     "DELIVERED",
};

export default async function handler(req, res) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "PATCH") return handlePatch(req, res);
  return methodNotAllowed(res, ["GET", "PATCH"]);
}

async function handleGet(req, res) {
  const expected = process.env.STAFF_PIN || process.env.ADMIN_PIN;
  if (!expected) {
    return res.status(500).json({ error: "Neither STAFF_PIN nor ADMIN_PIN is set in Vercel env vars." });
  }
  if (req.query.pin !== expected) {
    return res.status(401).json({ error: "Wrong PIN" });
  }
  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured." });
  }

  res.setHeader("Cache-Control", "no-store");

  const all = await getAllOrders();
  const orders = all
    .filter(o => ACTIVE_STATUSES.has(o.status))
    // Trimmed payload — order-fulfillment info only, no price breakdown,
    // no isDummy (Staff has no dummy control and doesn't need to see it).
    .map(o => ({
      orderNo: o.orderNo,
      customerName: o.customerName,
      items: (o.items || []).map(it => ({ productName: it.productName, quantity: it.quantity })),
      total: o.total,
      status: o.status,
      createdAt: o.createdAt,
    }));

  return res.status(200).json({ orders });
}

async function handlePatch(req, res) {
  const body = requireStaff(req, res); // writes its own 401/500 on failure
  if (!body) return;

  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured." });
  }

  const { orderNo, status } = body;
  if (!orderNo || !status) {
    return res.status(400).json({ error: "Missing orderNo or status" });
  }

  const raw = await redis.get(orderKey(orderNo));
  if (!raw) return res.status(404).json({ error: "Order not found" });
  const order = typeof raw === "string" ? JSON.parse(raw) : raw;

  // Always validated against the CURRENT stored status, fetched fresh right
  // here — this is what makes the concurrent Admin/Staff scenario in the
  // spec (section 26/27) safe: if Admin already moved this order to
  // DELIVERED/CANCELLED in the meantime, this lookup sees that immediately
  // and rejects, rather than trusting whatever the Staff screen had cached.
  const nextAllowed = STAFF_ALLOWED_TRANSITIONS[order.status];
  if (!nextAllowed || nextAllowed !== status) {
    return res.status(400).json({
      error: `Cannot change status from ${order.status} to ${status}`,
      currentStatus: order.status, // lets the client refresh to the real state
    });
  }

  order.status = status;
  order.updatedAt = Date.now();
  await redis.set(orderKey(orderNo), JSON.stringify(order));

  return res.status(200).json({ ok: true, order });
}
