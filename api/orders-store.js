// Shared order-retrieval helpers, used by both api/admin/orders.js and the
// new api/admin/analytics.js (Batch 3) so the Redis fetch/parse logic for
// "all recorded orders" lives in exactly one place. Pure read helpers only —
// order creation stays in api/orders.js, status/dummy mutation stays in
// api/admin/orders.js. This file doesn't change what's stored or how.

import { redis } from "./redis.js";

const INDEX_KEY = "orders:index";
const MAX_KEPT  = 1000; // same operational cap used since Batch 1
const orderKey  = (orderNo) => `order:${orderNo}`;

// Returns every recorded order (newest-first, same order as orders:index),
// fully parsed. Same behavior as the list branch of GET /api/admin/orders.
export async function getAllOrders() {
  const orderNos = await redis.lrange(INDEX_KEY, 0, MAX_KEPT - 1);
  if (!orderNos.length) return [];
  const raw = await redis.mget(...orderNos.map(orderKey));
  return raw
    .map(r => (r ? (typeof r === "string" ? JSON.parse(r) : r) : null))
    .filter(Boolean);
}
