// Shared order-storage helpers, used by api/orders.js, api/admin/orders.js,
// api/admin/analytics.js, and api/staff/orders.js — the Redis read/write
// logic for "the list of all recorded orders" lives in exactly one place.
//
// Deliberately uses ONLY redis.get()/redis.set() — the two primitives the
// original codebase already proved reliable (menu.js, site-config.js used
// them successfully before any of this Order Management System existed).
// The order index is stored as a single JSON-array string rather than a
// native Redis LIST, specifically to avoid depending on lpush/lrange/ltrim/
// mget, which were never verified against the real deployment and turned
// out to be the actual cause of the 500 errors on /api/admin/orders and
// /api/admin/analytics. This trades a small amount of write throughput
// (rewriting the whole index string on every new order) for using only
// commands already proven to work — the right tradeoff at café order volume.

import { redis } from "./redis.js";

const INDEX_KEY = "orders:index";
const MAX_KEPT  = 1000; // operational cap so the index can't grow forever
const orderKey  = (orderNo) => `order:${orderNo}`;

async function getIndex() {
  const raw = await redis.get(INDEX_KEY);
  if (!raw) return [];
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(parsed) ? parsed : [];
}

// Adds orderNo to the front of the index (newest-first) if it isn't
// already present, trims to MAX_KEPT, and persists it. Safe to call even
// if this exact orderNo is already indexed (no duplicate entries).
export async function addToIndex(orderNo) {
  const index = await getIndex();
  const withoutDup = index.filter(no => no !== orderNo);
  const next = [orderNo, ...withoutDup].slice(0, MAX_KEPT);
  await redis.set(INDEX_KEY, JSON.stringify(next));
}

// Returns every recorded order (newest-first), fully parsed. Fetches each
// order with its own redis.get() call (in parallel) rather than a single
// multi-key command, for the same "only use proven primitives" reason above.
export async function getAllOrders() {
  const orderNos = await getIndex();
  if (!orderNos.length) return [];
  const raw = await Promise.all(orderNos.map(no => redis.get(orderKey(no))));
  return raw
    .map(r => (r ? (typeof r === "string" ? JSON.parse(r) : r) : null))
    .filter(Boolean);
}

export async function getOrder(orderNo) {
  const raw = await redis.get(orderKey(orderNo));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveOrder(order) {
  await redis.set(orderKey(order.orderNo), JSON.stringify(order));
}
