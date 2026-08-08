// POST /api/orders
//
// Records an order placed through the existing customer checkout flow into
// Redis for the new Order Management System (OMS). This is purely additive:
// the customer-facing WhatsApp send flow in customer.js does not wait on
// this endpoint and does not depend on it succeeding (see customer.js —
// the call here is fire-and-forget so a Redis/API failure can never block
// or break the existing "Send Order" → WhatsApp behavior).
//
// Redis structure:
//   order:{orderNo}   → JSON string, the full order record (historical snapshot)
//   orders:index      → Redis list of orderNo values, newest first (LPUSH)
//
// orderNo is NOT generated here — it's the same order number the existing
// /api/order-number endpoint already issued for this order, passed in by
// the client, so WhatsApp and the OMS always refer to the same order.

import { redis, missingRedisConfig } from "../lib/redis.js";
import { getJsonBody, methodNotAllowed } from "../lib/api-utils.js";

const INDEX_KEY = "orders:index";
const MAX_KEPT  = 1000; // operational cap so the index list can't grow forever
const orderKey  = (orderNo) => `order:${orderNo}`;

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  if (missingRedisConfig()) {
    // Database not configured — fail quietly with a normal error response.
    // customer.js treats any failure here as non-fatal (see recordOrderForOMS).
    return res.status(500).json({ success: false, error: "Database not configured" });
  }

  const body = getJsonBody(req);
  const { orderNo, customerName, items, subtotal, discount, deliveryCharge, tax, total } = body;

  // ---- validation (structure only — see note in report re: price trust) ----
  if (orderNo === undefined || orderNo === null || orderNo === "") {
    return res.status(400).json({ success: false, error: "Missing orderNo" });
  }
  if (!customerName || !String(customerName).trim()) {
    return res.status(400).json({ success: false, error: "Missing customerName" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Order must include at least one item" });
  }
  for (const it of items) {
    const qty = Number(it.quantity);
    const unitPrice = Number(it.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, error: `Invalid quantity for item "${it.productName || it.productId || "?"}"` });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return res.status(400).json({ success: false, error: `Invalid price for item "${it.productName || it.productId || "?"}"` });
    }
  }
  if (!Number.isFinite(Number(total))) {
    return res.status(400).json({ success: false, error: "Invalid total" });
  }

  const now = Date.now();
  const order = {
    orderNo: String(orderNo),
    customerName: String(customerName).trim().slice(0, 120),
    items: items.map(it => ({
      productId:    String(it.productId ?? "").slice(0, 80),
      productName:  String(it.productName ?? "").slice(0, 160),
      categoryId:   String(it.categoryId ?? "").slice(0, 80),
      categoryName: String(it.categoryName ?? "").slice(0, 120),
      quantity:     Number(it.quantity),
      unitPrice:    Number(it.unitPrice),
      totalPrice:   Number(it.totalPrice ?? (Number(it.unitPrice) * Number(it.quantity))),
    })),
    subtotal:       Number.isFinite(Number(subtotal)) ? Number(subtotal) : Number(total),
    discount:       Number.isFinite(Number(discount)) ? Number(discount) : 0,
    deliveryCharge: Number.isFinite(Number(deliveryCharge)) ? Number(deliveryCharge) : 0,
    tax:            Number.isFinite(Number(tax)) ? Number(tax) : 0,
    total:          Number(total),
    status:         "NEW",
    isDummy:        false,
    createdAt:      now,
    updatedAt:      now,
  };

  try {
    // If this exact orderNo was already recorded (e.g. a duplicate Send Order
    // click), don't create a second index entry — just overwrite the record.
    const alreadyExists = await redis.exists(orderKey(order.orderNo));
    await redis.set(orderKey(order.orderNo), JSON.stringify(order));
    if (!alreadyExists) {
      await redis.lpush(INDEX_KEY, order.orderNo);
      await redis.ltrim(INDEX_KEY, 0, MAX_KEPT - 1);
    }
  } catch (err) {
    // Storage failure — report it, but this is still just an error response;
    // the caller (customer.js) never awaits/blocks on this endpoint.
    return res.status(500).json({ success: false, error: "Failed to save order" });
  }

  return res.status(200).json({ success: true, orderNo: order.orderNo });
}
