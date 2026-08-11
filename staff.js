/* ---------------- STATE ---------------- */
let staffPin = null;       // set once verified; sent with every write request
let pinEntry = "";
let alertsEnabled = false;
let audioCtx = null;
let seenNewOrderNos = new Set(); // in-memory only, per Batch 4 spec — not persisted
let pollTimer = null;
let isOnline = true;

/* ---------------- PIN GATE (mirrors admin.js's pattern) ---------------- */
const pinDotsEl = document.getElementById("pinDots");
const pinKeypadEl = document.getElementById("pinKeypad");
const MAX_PIN_DISPLAY = 10;

function renderPinDots(){
  pinDotsEl.innerHTML = "";
  const shown = Math.min(pinEntry.length, MAX_PIN_DISPLAY);
  for(let i=0;i<Math.max(shown,4);i++){
    const dot = document.createElement("span");
    if(i < shown) dot.classList.add("filled");
    pinDotsEl.appendChild(dot);
  }
}
function buildKeypad(){
  pinKeypadEl.innerHTML = "";
  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","OK"];
  keys.forEach(k => {
    const b = document.createElement("button");
    b.textContent = k;
    b.addEventListener("click", () => onPinKey(k));
    pinKeypadEl.appendChild(b);
  });
}
function onPinKey(k){
  if(k === "⌫"){ pinEntry = pinEntry.slice(0,-1); renderPinDots(); return; }
  if(k === "OK"){ checkPin(); return; }
  if(pinEntry.length < 12){ pinEntry += k; renderPinDots(); }
}
async function checkPin(){
  if(!pinEntry){ showToast("Enter your PIN first"); return; }
  try{
    const res = await apiFetch("/api/verify-staff-pin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinEntry })
    });
    if(res.ok){
      staffPin = pinEntry;
      pinEntry = "";
      document.getElementById("gateScreen").style.display = "none";
      document.getElementById("staffScreen").style.display = "block";
      initStaffScreen();
    } else {
      showToast("Wrong PIN, try again");
      pinEntry = "";
      renderPinDots();
    }
  }catch(e){
    showToast("Couldn't verify PIN: " + e.message);
  }
}
buildKeypad();
renderPinDots();

/* ---------------- ALERT SOUND ----------------
   Synthesized locally with the Web Audio API — no external file, no
   third-party asset, no network request. A short two-tone chime, well
   under a second, not a loop. */
function playAlertChime(){
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  [ { freq: 880, start: 0,    dur: 0.14 },
    { freq: 660, start: 0.15, dur: 0.22 } ].forEach(tone => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0, now + tone.start);
    gain.gain.linearRampToValueAtTime(0.22, now + tone.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + tone.start + tone.dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + tone.start);
    osc.stop(now + tone.start + tone.dur + 0.02);
  });
}

const alertEnableBtn = document.getElementById("alertEnableBtn");
alertEnableBtn.addEventListener("click", async () => {
  try{
    if(!audioCtx){
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if(audioCtx.state === "suspended"){
      await audioCtx.resume();
    }
    alertsEnabled = true;
    alertEnableBtn.textContent = "🔊 Alerts ON";
    alertEnableBtn.classList.add("enabled");
    playAlertChime(); // confirmation tone so staff knows it worked
  }catch(e){
    showToast("Couldn't enable audio alerts on this device — new orders will still show visually.");
  }
});

/* ---------------- ORDER AGE ---------------- */
function formatAge(createdAt){
  const mins = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if(mins < 1) return "Just now";
  if(mins === 1) return "1 min ago";
  if(mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ${mins % 60}m ago`;
}

/* ---------------- RENDER ---------------- */
const STATUS_META = {
  NEW:       { groupTitle: "🔔 New Orders",        groupClass: "new-group",       cardClass: "is-new",       actionLabel: "START PREPARING",     actionClass: "action-preparing", nextStatus: "PREPARING" },
  PREPARING: { groupTitle: "👨‍🍳 Preparing",         groupClass: "preparing-group", cardClass: "is-preparing", actionLabel: "READY FOR DELIVERY",  actionClass: "action-ready",     nextStatus: "READY" },
  READY:     { groupTitle: "✅ Ready for Delivery", groupClass: "ready-group",     cardClass: "is-ready",     actionLabel: "MARK DELIVERED",      actionClass: "action-delivered", nextStatus: "DELIVERED" },
};

function renderOrderCard(o){
  const meta = STATUS_META[o.status];
  if(!meta) return ""; // defensive — shouldn't happen, active endpoint only returns these 3 statuses
  return `
    <div class="staff-order-card ${meta.cardClass}" data-order-no="${escapeHtml(o.orderNo)}">
      <div class="staff-order-top">
        <span class="staff-order-no">${escapeHtml(o.orderNo)}</span>
        <span class="staff-order-age">${formatAge(o.createdAt)}</span>
      </div>
      <div class="staff-order-customer">${escapeHtml(o.customerName)}</div>
      <div class="staff-order-items">
        ${o.items.map(it => `<div class="staff-order-item-row">${escapeHtml(it.productName)} × ${it.quantity}</div>`).join("")}
      </div>
      <div class="staff-order-total">${money(o.total)}</div>
      <button class="staff-action-btn ${meta.actionClass}" data-act="advance" data-order-no="${escapeHtml(o.orderNo)}" data-next-status="${meta.nextStatus}">
        ${meta.actionLabel}
      </button>
    </div>
  `;
}

function renderQueue(orders){
  const content = document.getElementById("staffOrdersContent");
  if(!orders.length){
    content.innerHTML = `<div class="staff-empty-note">No active orders right now. 🎉</div>`;
    return;
  }
  const groups = { NEW: [], PREPARING: [], READY: [] };
  orders.forEach(o => { if(groups[o.status]) groups[o.status].push(o); });

  let html = "";
  ["NEW", "PREPARING", "READY"].forEach(status => {
    const list = groups[status];
    if(!list.length) return;
    const meta = STATUS_META[status];
    html += `<div class="staff-group-title ${meta.groupClass}">${meta.groupTitle} (${list.length})</div>`;
    html += list.map(renderOrderCard).join("");
  });
  content.innerHTML = html || `<div class="staff-empty-note">No active orders right now. 🎉</div>`;
}

/* ---------------- POLLING ---------------- */
function setConnectionStatus(online){
  isOnline = online;
  const dot = document.getElementById("connDot");
  const label = document.getElementById("connLabel");
  if(!dot || !label) return;
  dot.classList.toggle("offline", !online);
  label.textContent = online ? "Connected" : "Offline / Reconnecting…";
}

async function fetchAndRenderOrders(){
  try{
    const { orders } = await apiFetch(`/api/staff/orders?pin=${encodeURIComponent(staffPin)}`);
    setConnectionStatus(true);

    // Alert dedup: only orders newly seen as NEW this session trigger a sound.
    const currentNewIds = new Set(orders.filter(o => o.status === "NEW").map(o => o.orderNo));
    const freshlyArrived = [...currentNewIds].filter(id => !seenNewOrderNos.has(id));
    if(freshlyArrived.length && alertsEnabled){
      playAlertChime();
    }
    seenNewOrderNos = currentNewIds; // orders that leave NEW naturally drop out here too

    renderQueue(orders);
    document.getElementById("lastUpdatedLabel").textContent =
      "Last updated: " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }catch(e){
    setConnectionStatus(false);
  }
}

const POLL_MS = 8000;
function startPolling(){
  stopPolling();
  pollTimer = setInterval(fetchAndRenderOrders, POLL_MS);
}
function stopPolling(){
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
}
document.addEventListener("visibilitychange", () => {
  if(document.hidden){
    stopPolling(); // reduce unnecessary traffic while the screen isn't visible
  }else{
    fetchAndRenderOrders(); // refresh immediately on return
    startPolling();
  }
});

/* ---------------- STATUS ACTIONS (double-tap protected) ---------------- */
document.getElementById("staffOrdersContent").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act='advance']");
  if(!btn) return;
  const orderNo = btn.dataset.orderNo;
  const nextStatus = btn.dataset.nextStatus;

  btn.disabled = true; // prevents double-tap firing two requests
  try{
    await apiFetch("/api/staff/orders", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: staffPin, orderNo, status: nextStatus })
    });
    showToast(`${orderNo} → ${nextStatus}`);
  }catch(err){
    // Most likely cause: someone else (Admin, or this same order elsewhere)
    // already changed its status — refresh to show the real current state
    // rather than trusting stale UI, per the spec's concurrent-edit case.
    showToast("Couldn't update — refreshing current status.");
  }
  await fetchAndRenderOrders();
});

/* ---------------- INIT ---------------- */
function initStaffScreen(){
  fetchAndRenderOrders();
  startPolling();
}
