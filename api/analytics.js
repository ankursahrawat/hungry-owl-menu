// Pure analytics computation over already-recorded orders (Batch 1/2 data).
// No new storage, no new source of truth — this only reads and aggregates
// the same order records the Admin Orders section already uses.
//
// Kept isolated in its own file (no Redis calls here) so it's easy to unit
// test and easy to swap for pre-aggregated data later if order volume ever
// grows enough to need it — see the report note on this in the Batch 3 reply.

// India has no DST, so a fixed +5:30 offset is correct year-round — no need
// for a timezone database lookup for this.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Returns the IST wall-clock components (year, 0-based month, day, weekday)
// for a given UTC epoch ms. Using getUTC* accessors on the shifted timestamp
// is what makes this read "as if" IST, without any timezone library.
function istParts(epochMs) {
  const d = new Date(epochMs + IST_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),   // 0-11
    d: d.getUTCDate(),
    dow: d.getUTCDay(),   // 0=Sun .. 6=Sat
  };
}

// Converts IST calendar-date components back to a UTC epoch ms boundary.
function istDateToUTCms(y, m, d, hh = 0, mm = 0, ss = 0, ms = 0) {
  return Date.UTC(y, m, d, hh, mm, ss, ms) - IST_OFFSET_MS;
}

function istDayKey(epochMs) {
  const p = istParts(epochMs);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
function istMonthKey(epochMs) {
  const p = istParts(epochMs);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Resolves a named preset (or "custom") into a concrete [fromMs, toMs] range
// in IST, plus which breakdown granularity makes sense for it. `nowMs`
// is injectable for testing; defaults to the real current time.
export function resolveRange(preset, customFrom, customTo, nowMs = Date.now()) {
  const now = istParts(nowMs);
  const todayStartMs = istDateToUTCms(now.y, now.m, now.d, 0, 0, 0, 0);
  // "end of today" for open-ended presets — clamp to `nowMs` itself so we
  // never claim sales for time that hasn't happened yet.
  const nowClamp = nowMs;

  if (preset === "today") {
    return { fromMs: todayStartMs, toMs: nowClamp, groupBy: "day" };
  }
  if (preset === "yesterday") {
    const y = new Date(todayStartMs); y.setUTCDate(y.getUTCDate() - 1);
    const yStart = y.getTime();
    return { fromMs: yStart, toMs: todayStartMs - 1, groupBy: "day" };
  }
  if (preset === "week") {
    // Monday-start week, matching the spec's Mon..Sun example.
    const mondayOffset = (now.dow + 6) % 7; // 0 if today is Monday
    const weekStart = new Date(todayStartMs); weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);
    return { fromMs: weekStart.getTime(), toMs: nowClamp, groupBy: "day" };
  }
  if (preset === "month") {
    const monthStart = istDateToUTCms(now.y, now.m, 1, 0, 0, 0, 0);
    return { fromMs: monthStart, toMs: nowClamp, groupBy: "day" };
  }
  if (preset === "quarter") {
    const qStartMonth = Math.floor(now.m / 3) * 3;
    const qStart = istDateToUTCms(now.y, qStartMonth, 1, 0, 0, 0, 0);
    return { fromMs: qStart, toMs: nowClamp, groupBy: "month" };
  }
  if (preset === "year") {
    const yearStart = istDateToUTCms(now.y, 0, 1, 0, 0, 0, 0);
    return { fromMs: yearStart, toMs: nowClamp, groupBy: "month" };
  }
  if (preset === "custom") {
    // customFrom/customTo are "YYYY-MM-DD" strings, interpreted as IST
    // calendar dates (start of `from` through end of `to`).
    const [fy, fm, fd] = String(customFrom || "").split("-").map(Number);
    const [ty, tm, td] = String(customTo   || "").split("-").map(Number);
    if (!fy || !fm || !fd || !ty || !tm || !td) {
      throw new Error("Invalid custom date range");
    }
    let fromMs = istDateToUTCms(fy, fm - 1, fd, 0, 0, 0, 0);
    let toMs   = istDateToUTCms(ty, tm - 1, td, 23, 59, 59, 999);
    if (toMs < fromMs) [fromMs, toMs] = [toMs, fromMs]; // tolerate swapped inputs
    if (toMs > nowClamp) toMs = nowClamp; // never allow future dates to produce results
    // Span-dependent breakdown granularity: day-level for anything up to
    // ~45 days (covers week/month-ish custom ranges), month-level beyond
    // that (covers quarter/year-ish custom ranges) — keeps the breakdown
    // list from ever being absurdly long.
    const spanDays = (toMs - fromMs) / 86400000;
    return { fromMs, toMs, groupBy: spanDays > 45 ? "month" : "day" };
  }

  throw new Error(`Unknown date preset "${preset}"`);
}

// order counts toward sales analytics only when DELIVERED and not dummy —
// this single predicate is the one place that rule lives, per every batch
// of testing in the spec (dummy/cancelled/new orders must never leak in).
function isQualifying(order, fromMs, toMs) {
  return order.status === "DELIVERED"
    && order.isDummy === false
    && order.createdAt >= fromMs
    && order.createdAt <= toMs;
}

export function computeAnalytics(orders, { fromMs, toMs, groupBy }) {
  const qualifying = orders.filter(o => isQualifying(o, fromMs, toMs));

  const sales = qualifying.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const orderCount = qualifying.length;
  const averageOrderValue = orderCount > 0 ? sales / orderCount : 0;

  // ---- time breakdown ----
  const bucketMap = new Map(); // key -> { label, sales }
  qualifying.forEach(o => {
    const key = groupBy === "month" ? istMonthKey(o.createdAt) : istDayKey(o.createdAt);
    if (!bucketMap.has(key)) {
      let label;
      if (groupBy === "month") {
        const [, m] = key.split("-").map(Number);
        label = MONTH_LABELS[m - 1];
      } else {
        const p = istParts(o.createdAt);
        label = `${DAY_LABELS[p.dow]} ${MONTH_LABELS[p.m]} ${p.d}`;
      }
      bucketMap.set(key, { key, label, sales: 0 });
    }
    bucketMap.get(key).sales += Number(o.total) || 0;
  });
  const breakdown = Array.from(bucketMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  // ---- item performance (historical snapshot values only — never the
  // current menu price, per spec) ----
  const itemMap = new Map(); // productId -> { itemId, itemName, categoryId, categoryName, quantitySold, revenue }
  qualifying.forEach(o => {
    (o.items || []).forEach(it => {
      const key = it.productId || it.productName;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          itemId: it.productId,
          itemName: it.productName,
          categoryId: it.categoryId,
          categoryName: it.categoryName,
          quantitySold: 0,
          revenue: 0,
        });
      }
      const entry = itemMap.get(key);
      entry.quantitySold += Number(it.quantity) || 0;
      entry.revenue += Number(it.totalPrice) || 0;
    });
  });
  const items = Array.from(itemMap.values());

  // ---- category performance ----
  const catMap = new Map(); // categoryId -> { categoryId, categoryName, quantitySold, revenue }
  items.forEach(it => {
    const key = it.categoryId || it.categoryName || "uncategorized";
    if (!catMap.has(key)) {
      catMap.set(key, {
        categoryId: it.categoryId,
        categoryName: it.categoryName,
        quantitySold: 0,
        revenue: 0,
      });
    }
    const entry = catMap.get(key);
    entry.quantitySold += it.quantitySold;
    entry.revenue += it.revenue;
  });
  const categories = Array.from(catMap.values());

  return {
    sales,
    orders: orderCount,
    averageOrderValue,
    breakdown,
    items,
    categories,
  };
}
