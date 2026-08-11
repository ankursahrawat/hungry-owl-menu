// GET   /api/admin/orders            → list recent orders, newest first
// GET   /api/admin/orders?orderNo=…  → a single order's full detail
// PATCH /api/admin/orders            → update status and/or isDummy on one order
//         body: { pin, orderNo, status?, isDummy? }
//
// Reuses the existing admin PIN mechanism (same ADMIN_PIN env var used by
// requireAdmin() elsewhere in this project). GET requests can't carry a
// JSON body the way POST does, so the PIN is passed as a query string param
// for GET; PATCH uses the same body-based requireAdmin() helper as the rest
// of the project's mutating endpoints (site-config.js, order-number.js).
//
// Batch 2 status rules (see OMS Batch 2 spec), extended in Batch 4 to
// recognize the new staff-workflow statuses (PREPARING, READY) that
// api/staff/orders.js can now set:
//   Full status enum: NEW, PREPARING, READY, DELIVERED, CANCELLED
//   Admin transitions: from NEW/PREPARING/READY -> DELIVERED or CANCELLED
//     (Admin can always override straight to Delivered/Cancelled from any
//     active state — Batch 4 explicitly requires this stays available even
//     though Staff itself must follow the strict linear workflow.)
//   Admin can NOT set PREPARING or READY here — those are Staff-only
//   (see api/staff/orders.js), enforced simply by never including them as
//   a valid target in this transition map.
//   Anything from DELIVERED/CANCELLED is rejected, same as Batch 2.
//   isDummy is an independent boolean flag, not a status — it can be toggled
//   regardless of the order's current status, in either direction.
//   Cancelling / marking dummy NEVER deletes the order record.

import { redis, missingRedisConfig } from "../../lib/redis.js";
import { methodNotAllowed, requireAdmin } from "../../lib/api-utils.js";
import { getAllOrders } from "../../lib/orders-store.js";

const orderKey = (orderNo) => `order:${orderNo}`;

const ALLOWED_STATUSES    = new Set(["NEW", "PREPARING", "READY", "DELIVERED", "CANCELLED"]);
const ALLOWED_TRANSITIONS = {
  NEW:       new Set(["DELIVERED", "CANCELLED"]),
  PREPARING: new Set(["DELIVERED", "CANCELLED"]),
  READY:     new Set(["DELIVERED", "CANCELLED"]),
};

export default async function handler(req, res) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "PATCH") return handlePatch(req, res);
  return methodNotAllowed(res, ["GET", "PATCH"]);
}

async function handleGet(req, res) {
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
  const orders = await getAllOrders();
  return res.status(200).json({ orders });
}

async function handlePatch(req, res) {
  const body = requireAdmin(req, res); // writes its own 401/500 on failure
  if (!body) return;

  if (missingRedisConfig()) {
    return res.status(500).json({ error: "Database not configured." });
  }

  const { orderNo, status, isDummy } = body;
  if (!orderNo) return res.status(400).json({ error: "Missing orderNo" });
  if (status === undefined && isDummy === undefined) {
    return res.status(400).json({ error: "Nothing to update — provide status and/or isDummy" });
  }

  const raw = await redis.get(orderKey(orderNo));
  if (!raw) return res.status(404).json({ error: "Order not found" });
  const order = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (status !== undefined) {
    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ error: `Invalid status "${status}"` });
    }
    const allowedNext = ALLOWED_TRANSITIONS[order.status];
    if (!allowedNext || !allowedNext.has(status)) {
      return res.status(400).json({ error: `Cannot change status from ${order.status} to ${status}` });
    }
    order.status = status;
  }

  if (isDummy !== undefined) {
    order.isDummy = !!isDummy; // independent flag — no transition restriction, either direction always allowed
  }

  order.updatedAt = Date.now();
  await redis.set(orderKey(orderNo), JSON.stringify(order));

  return res.status(200).json({ ok: true, order });
}
