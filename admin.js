/* ---------------- STATE ---------------- */
let menu = { sections: [] };
let adminPin = null; // set once verified; sent with every write request
let uploadedLogoDraft = null;
let pinEntry = "";

function uid(prefix){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ---------------- PIN GATE ---------------- */
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
    const res = await apiFetch("/api/verify-pin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pinEntry })
    });
    if(res.ok){
      adminPin = pinEntry;
      pinEntry = "";
      document.getElementById("gateScreen").style.display = "none";
      document.getElementById("adminScreen").style.display = "block";
      await initAdminScreen();
    } else {
      showToast("Wrong PIN, try again");
      pinEntry = "";
      renderPinDots();
    }
  }catch(err){
    showToast("Couldn't verify PIN: " + err.message);
  }
}
buildKeypad();
renderPinDots();

/* ---------------- STATUS CHIPS ---------------- */
async function renderStatus(){
  const row = document.getElementById("statusRow");
  try{
    const s = await api.getStatus();
    row.innerHTML = [
      chip(s.databaseConfigured, "Database"),
      chip(s.whatsappConfigured, "WhatsApp"),
    ].join("");
  }catch(e){
    row.innerHTML = `<span class="status-chip warn">⚠️ Couldn't check status</span>`;
  }
}
function chip(ok, label){
  return `<span class="status-chip ${ok?'ok':'warn'}">${ok?'✅':'⚠️'} ${label} ${ok?'connected':'not configured'}</span>`;
}

/* ---------------- OMS — Recent Orders (Batch 2: search, filters, status, dummy) ---------------- */
function formatOrderTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function money2(n){ return "₹" + Number(n).toString(); }

let allOrders = [];             // full fetched set — search/filter applied client-side over this
let orderStatusFilter = "all";  // all | NEW | DELIVERED | CANCELLED | DUMMY
let orderDateFilter = "all";    // all | today | yesterday | week | month
let orderSearchText = "";
let openOrderNos = new Set();   // preserves which cards stay expanded across re-renders

async function loadOrders(){
  const wrap = document.getElementById("ordersList");
  if(!wrap) return; // admin.html not updated yet — fail quietly, nothing else depends on this
  try{
    const { orders } = await api.getOrders(adminPin);
    allOrders = orders || [];
    renderOrdersList();
  }catch(e){
    wrap.innerHTML = `<p class="hint">Couldn't load orders: ${escapeHtml(e.message)}</p>`;
  }
}

function isSameDay(a, b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
// Date filtering is done client-side against each order's existing createdAt
// timestamp — no Redis restructuring needed, the data's already there.
function matchesDateFilter(ts){
  if(orderDateFilter === "all") return true;
  const d = new Date(ts), now = new Date();
  if(orderDateFilter === "today") return isSameDay(d, now);
  if(orderDateFilter === "yesterday"){
    const y = new Date(now); y.setDate(y.getDate()-1);
    return isSameDay(d, y);
  }
  if(orderDateFilter === "week"){
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate()-7);
    return d >= weekAgo && d <= now;
  }
  if(orderDateFilter === "month"){
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  }
  return true;
}

function getFilteredOrders(){
  const q = orderSearchText.trim().toLowerCase();
  return allOrders.filter(o => {
    if(orderStatusFilter === "DUMMY" && !o.isDummy) return false;
    if(orderStatusFilter !== "all" && orderStatusFilter !== "DUMMY" && o.status !== orderStatusFilter) return false;
    if(!matchesDateFilter(o.createdAt)) return false;
    if(q && !((o.orderNo + " " + o.customerName).toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderOrderCard(o){
  const canAct = o.status === "NEW";
  const isOpen = openOrderNos.has(o.orderNo);
  return `
    <details class="order-card" data-order-no="${escapeHtml(o.orderNo)}"${isOpen ? " open" : ""}>
      <summary class="order-card-summary">
        <span class="order-no">${escapeHtml(o.orderNo)}</span>
        <span class="order-customer">${escapeHtml(o.customerName)}</span>
        <span class="order-total">${money2(o.total)}</span>
        <span class="order-status order-status--${o.status.toLowerCase()}">${escapeHtml(o.status)}</span>
        ${o.isDummy ? `<span class="order-status order-status--dummy">DUMMY</span>` : ""}
        <span class="order-time">${formatOrderTime(o.createdAt)}</span>
      </summary>
      <div class="order-card-detail">
        <div class="order-detail-items">
          ${o.items.map(it => `
            <div class="order-detail-item">
              <span>${escapeHtml(it.productName)} × ${it.quantity}${it.categoryName ? ` <span class="order-item-cat">(${escapeHtml(it.categoryName)})</span>` : ""}</span>
              <span>${money2(it.totalPrice)}</span>
            </div>
          `).join("")}
        </div>
        <div class="order-detail-totals">
          <div><span>Subtotal</span><span>${money2(o.subtotal)}</span></div>
          ${o.discount ? `<div><span>Discount</span><span>−${money2(o.discount)}</span></div>` : ""}
          ${o.deliveryCharge ? `<div><span>Delivery</span><span>${money2(o.deliveryCharge)}</span></div>` : ""}
          ${o.tax ? `<div><span>Tax</span><span>${money2(o.tax)}</span></div>` : ""}
          <div class="order-detail-total-row"><span>Total</span><span>${money2(o.total)}</span></div>
        </div>
        <p class="hint" style="margin-top:8px;">
          Dummy: ${o.isDummy ? "Yes" : "No"} · Created ${new Date(o.createdAt).toLocaleString()}
        </p>
        <div class="order-actions">
          ${canAct ? `
            <button class="btn btn-small" data-order-act="deliver" data-order-no="${escapeHtml(o.orderNo)}">✅ Mark Delivered</button>
            <button class="btn btn-small btn-danger" data-order-act="cancel" data-order-no="${escapeHtml(o.orderNo)}">✕ Cancel Order</button>
          ` : ""}
          ${o.isDummy
            ? `<button class="btn btn-small btn-secondary" data-order-act="undummy" data-order-no="${escapeHtml(o.orderNo)}">↩ Restore as Real Order</button>`
            : `<button class="btn btn-small btn-secondary" data-order-act="dummy" data-order-no="${escapeHtml(o.orderNo)}">🧪 Mark as Dummy</button>`
          }
        </div>
      </div>
    </details>
  `;
}

function renderOrdersList(){
  const wrap = document.getElementById("ordersList");
  if(!wrap) return;
  if(!allOrders.length){
    wrap.innerHTML = `<p class="hint">No orders yet — they'll show up here as soon as customers check out.</p>`;
    return;
  }
  const orders = getFilteredOrders();
  if(!orders.length){
    wrap.innerHTML = `<p class="hint">No orders match your search/filter.</p>`;
    return;
  }
  wrap.innerHTML = orders.map(o => renderOrderCard(o)).join("");
}

const refreshOrdersBtnEl = document.getElementById("refreshOrdersBtn");
if(refreshOrdersBtnEl){
  refreshOrdersBtnEl.addEventListener("click", () => loadOrders());
}

const ordersListEl = document.getElementById("ordersList");
if(ordersListEl){
  // 'toggle' doesn't bubble, but capture-phase listeners still see it on the way down.
  ordersListEl.addEventListener("toggle", (e) => {
    const details = e.target.closest(".order-card");
    if(!details) return;
    const no = details.dataset.orderNo;
    if(details.open) openOrderNos.add(no); else openOrderNos.delete(no);
  }, true);

  ordersListEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-order-act]");
    if(!btn) return;
    const act = btn.dataset.orderAct;
    const orderNo = btn.dataset.orderNo;

    if(act === "deliver"){
      btn.disabled = true;
      try{
        await api.updateOrder(adminPin, orderNo, { status: "DELIVERED" });
        await loadOrders();
        showToast(`${orderNo} marked delivered`);
      }catch(err){ showToast("Couldn't update: " + err.message); btn.disabled = false; }

    }else if(act === "cancel"){
      if(!confirm(`Cancel Order?\nAre you sure you want to cancel ${orderNo}?`)) return;
      btn.disabled = true;
      try{
        await api.updateOrder(adminPin, orderNo, { status: "CANCELLED" });
        await loadOrders();
        showToast(`${orderNo} cancelled`);
      }catch(err){ showToast("Couldn't cancel: " + err.message); btn.disabled = false; }

    }else if(act === "dummy"){
      if(!confirm("Mark this order as Dummy?\nDummy orders will not be included in sales or business analytics.")) return;
      btn.disabled = true;
      try{
        await api.updateOrder(adminPin, orderNo, { isDummy: true });
        await loadOrders();
        showToast(`${orderNo} marked as dummy`);
      }catch(err){ showToast("Couldn't update: " + err.message); btn.disabled = false; }

    }else if(act === "undummy"){
      if(!confirm("Restore this order as a real order?")) return;
      btn.disabled = true;
      try{
        await api.updateOrder(adminPin, orderNo, { isDummy: false });
        await loadOrders();
        showToast(`${orderNo} restored as real order`);
      }catch(err){ showToast("Couldn't update: " + err.message); btn.disabled = false; }
    }
  });
}

const orderSearchInputEl = document.getElementById("orderSearchInput");
if(orderSearchInputEl){
  orderSearchInputEl.addEventListener("input", (e) => {
    orderSearchText = e.target.value;
    renderOrdersList();
  });
}

const orderFilterChipsEl = document.getElementById("orderFilterChips");
if(orderFilterChipsEl){
  orderFilterChipsEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if(!chip) return;
    orderFilterChipsEl.querySelectorAll(".filter-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    orderStatusFilter = chip.dataset.filter;
    renderOrdersList();
  });
}

const orderDateFilterEl = document.getElementById("orderDateFilter");
if(orderDateFilterEl){
  orderDateFilterEl.addEventListener("change", (e) => {
    orderDateFilter = e.target.value;
    renderOrdersList();
  });
}

/* ---------------- INIT ---------------- */
async function initAdminScreen(){
  await renderStatus();
  await Promise.all([loadAndRenderMenu(), loadAndPopulateBranding(), loadOrders()]);
  renderQR();
}

async function loadAndRenderMenu(){
  try{
    menu = await api.getMenu();
  }catch(e){
    showToast("Couldn't load menu: " + e.message);
    menu = { sections: [] };
  }
  renderAdmin();
}

async function saveMenu(){
  try{
    await api.saveMenu(adminPin, menu);
  }catch(e){
    showToast("Couldn't save: " + e.message);
  }
}

/* ---------------- QR CODE ---------------- */
function renderQR(){
  const customerUrl = window.location.origin + "/";
  document.getElementById("qrBox").innerHTML = renderQRCodeSVG(customerUrl, 220);
  document.getElementById("qrUrl").textContent = customerUrl;
}
document.getElementById("viewMenuBtn").addEventListener("click", () => {
  window.open(window.location.origin + "/", "_blank");
});

/* ---------------- BRANDING ---------------- */
async function loadAndPopulateBranding(){
  let cfg;
  try{ cfg = await api.getSiteConfig(); }
  catch(e){ cfg = { brandName:"", tagline:"", logoEmoji:"", logoImage:"", phone:"", announcement:"", bestsellerIds:[] }; }
  window.__bestsellerIds = Array.isArray(cfg.bestsellerIds) ? cfg.bestsellerIds : [];
  document.getElementById("cfgBrandName").value = cfg.brandName || "";
  document.getElementById("cfgTagline").value = cfg.tagline || "";
  document.getElementById("cfgLogoEmoji").value = cfg.logoEmoji || "";
  document.getElementById("cfgPhone").value = cfg.phone || "";
  document.getElementById("cfgAnnouncement").value = cfg.announcement || "";
  uploadedLogoDraft = null;
  renderLogoPreview(cfg);
  window.__lastSiteConfig = cfg;
}
function renderLogoPreview(cfg){
  const preview = document.getElementById("logoPreview");
  const removeBtn = document.getElementById("removeLogoBtn");
  const current = uploadedLogoDraft !== null ? uploadedLogoDraft : cfg.logoImage;
  if(current){
    preview.innerHTML = `<img src="${current}" alt="Logo preview">`;
    removeBtn.style.display = "inline-flex";
  } else {
    preview.innerHTML = (cfg.logoEmoji && cfg.logoEmoji.trim()) ? escapeHtml(cfg.logoEmoji.trim()) : "🦉";
    removeBtn.style.display = "none";
  }
}
function readAndCompressImage(file){
  return new Promise((resolve, reject) => {
    if(!file.type.startsWith("image/")){ reject(new Error("Please choose an image file")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load that image"));
      img.onload = () => {
        const target = 300;
        const canvas = document.createElement("canvas");
        canvas.width = target; canvas.height = target;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0,0,target,target);
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while(dataUrl.length > 700000 && quality > 0.3){
          quality -= 0.15;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
document.getElementById("logoFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const hint = document.getElementById("logoHint");
  hint.textContent = "Processing image…";
  try{
    const dataUrl = await readAndCompressImage(file);
    uploadedLogoDraft = dataUrl;
    renderLogoPreview(window.__lastSiteConfig || {});
    hint.textContent = "Logo ready — tap \"Save Branding\" to apply it.";
  }catch(err){
    hint.textContent = "Couldn't use that image: " + err.message;
  }
  e.target.value = "";
});
document.getElementById("removeLogoBtn").addEventListener("click", () => {
  uploadedLogoDraft = "";
  renderLogoPreview(window.__lastSiteConfig || {});
  document.getElementById("logoHint").textContent = "Logo will be removed when you tap \"Save Branding\".";
});
document.getElementById("saveBrandBtn").addEventListener("click", async () => {
  const existing = window.__lastSiteConfig || {};
  const cfg = {
    brandName: document.getElementById("cfgBrandName").value.trim(),
    tagline: document.getElementById("cfgTagline").value.trim(),
    logoEmoji: document.getElementById("cfgLogoEmoji").value.trim(),
    phone: document.getElementById("cfgPhone").value.trim(),
    logoImage: uploadedLogoDraft !== null ? uploadedLogoDraft : existing.logoImage,
    announcement: existing.announcement || "",
  };
  try{
    await api.saveSiteConfig(adminPin, cfg);
    window.__lastSiteConfig = cfg;
    uploadedLogoDraft = null;
    renderLogoPreview(cfg);
    document.getElementById("logoHint").textContent = "";
    showToast("Branding saved");
  }catch(e){
    document.getElementById("logoHint").textContent = "Couldn't save: " + e.message;
  }
});

document.getElementById("saveBannerBtn").addEventListener("click", async () => {
  const existing = window.__lastSiteConfig || {};
  const cfg = {
    brandName: existing.brandName || "",
    tagline: existing.tagline || "",
    logoEmoji: existing.logoEmoji || "",
    phone: existing.phone || "",
    logoImage: existing.logoImage || "",
    announcement: document.getElementById("cfgAnnouncement").value.trim(),
  };
  try{
    await api.saveSiteConfig(adminPin, cfg);
    window.__lastSiteConfig = cfg;
    document.getElementById("bannerHint").textContent = "";
    showToast(cfg.announcement ? "Banner saved" : "Banner cleared");
  }catch(e){
    document.getElementById("bannerHint").textContent = "Couldn't save: " + e.message;
  }
});

/* ---------------- FULL MENU IMAGE DOWNLOAD ---------------- */

/* ── BRAND ASSETS (embedded) ── */
const BRAND_LOGO_B64 = "/brand-logo.svg";
const BRAND_QR_B64   = "/brand-qr.svg";

/* ── PREMIUM MENU GENERATOR ── */
function loadImg(src){
  return new Promise((res,rej)=>{
    const img=new Image(); img.crossOrigin="anonymous";
    img.onload=()=>res(img); img.onerror=rej; img.src=src;
  });
}

async function generateFullMenuImageBlob(){
  const cfg     = window.__lastSiteConfig || {};
  const bestSet = new Set(window.__bestsellerIds || []);
  const scale   = 3;          // high-res for print
  const CW      = 660;        // CSS width
  const COL     = (CW-80)/2;  // column width

  /* ── fonts (canvas built-ins only) ── */
  const F = {
    brand:  (s)=>`900 ${s}px Trebuchet MS, Arial, sans-serif`,
    title:  (s)=>`800 ${s}px Arial, sans-serif`,
    label:  (s)=>`700 ${s}px Arial, sans-serif`,
    item:   (s)=>`600 ${s}px Arial, sans-serif`,
    price:  (s)=>`900 ${s}px Arial, sans-serif`,
  };

  /* ── measure pass to compute height ── */
  const tmp = document.createElement("canvas");
  tmp.width = CW*scale; tmp.height = 100;
  const mx = tmp.getContext("2d");

  /* count total item rows in two-column layout */
  const allSections = menu.sections.map(sec=>({
    ...sec,
    items: sec.items.length ? sec.items : [{id:"_",name:"Coming soon",price:0}]
  }));
  const half = Math.ceil(allSections.length/2);
  const leftSecs  = allSections.slice(0, half);
  const rightSecs = allSections.slice(half);

  function secHeight(secs){
    let h = 0;
    secs.forEach(sec=>{
      h += 30; // section title
      sec.items.forEach(it=>{ h += 22; }); // item row
      h += 14; // gap after section
    });
    return h;
  }

  const HEADER_H = 230;
  const BODY_PAD = 22;
  const COL_H    = Math.max(secHeight(leftSecs), secHeight(rightSecs));
  const QR_H     = 160;
  const FOOTER_H = 50;
  const BEST_LEGEND_H = 22;
  const RIGHT_EXTRA = QR_H + BEST_LEGEND_H + 14;
  const RIGHT_TOTAL = secHeight(rightSecs) + RIGHT_EXTRA;
  const BODY_H   = Math.max(COL_H, RIGHT_TOTAL) + BODY_PAD*2;
  const GOLD_H   = 5;
  const CH       = HEADER_H + GOLD_H + BODY_H + GOLD_H + FOOTER_H + 16;

  /* ── create final canvas ── */
  const canvas = document.createElement("canvas");
  canvas.width  = CW   * scale;
  canvas.height = CH   * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  const G = {
    black:   "#0f0f0f",
    gold:    "#F0AC11",
    goldDim: "rgba(240,172,17,0.15)",
    accent:  "#FFC52E",
    cream:   "#d4c9a8",
    muted:   "rgba(240,172,17,0.12)",
    border:  "rgba(240,172,17,0.35)",
    white:   "#ffffff",
  };

  /* helpers */
  function roundRect(x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }
  function fillRR(x,y,w,h,r,col){ roundRect(x,y,w,h,r); ctx.fillStyle=col; ctx.fill(); }
  function strokeRR(x,y,w,h,r,col,lw){ roundRect(x,y,w,h,r); ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.stroke(); }

  /* outer shell — double gold border */
  fillRR(0,0,CW,CH,3,G.black);
  strokeRR(1,1,CW-2,CH-2,3,G.gold,2);
  strokeRR(5,5,CW-10,CH-10,2,"rgba(240,172,17,0.3)",1);

  /* ── HEADER ── */
  const HW = CW-12, HX = 6, HY = 6, HH = HEADER_H;
  fillRR(HX,HY,HW,HH,16,G.gold);
  /* diagonal texture */
  ctx.save();
  roundRect(HX,HY,HW,HH,16); ctx.clip();
  ctx.strokeStyle="rgba(0,0,0,0.045)"; ctx.lineWidth=1;
  for(let i=-HH; i<HW+HH; i+=18){
    ctx.beginPath(); ctx.moveTo(HX+i,HY); ctx.lineTo(HX+i+HH,HY+HH); ctx.stroke();
  }
  ctx.restore();
  /* inner border */
  strokeRR(HX+8,HY+8,HW-16,HH-16,10,"#151515",2.5);
  strokeRR(HX+13,HY+13,HW-26,HH-26,7,"rgba(0,0,0,0.18)",1);
  /* corner marks */
  const cm=[[HX+20,HY+20],[HX+HW-20,HY+20],[HX+20,HY+HH-20],[HX+HW-20,HY+HH-20]];
  const cdir=[[1,1],[-1,1],[1,-1],[-1,-1]];
  cm.forEach(([cx2,cy2],[dx,dy])=>{
    ctx.strokeStyle="#151515"; ctx.lineWidth=2; ctx.beginPath();
    ctx.moveTo(cx2,cy2); ctx.lineTo(cx2+dx*12,cy2);
    ctx.moveTo(cx2,cy2); ctx.lineTo(cx2,cy2+dy*12);
    ctx.stroke();
  });

  /* logo — load brand logo SVG */
  let logoY = HY+22;
  try{
    const logoSrc = cfg.logoImage || BRAND_LOGO_B64;
    const logoImg = await loadImg(logoSrc);
    const lH = 90, lW = lH*(836/1254);
    ctx.drawImage(logoImg, HX+HW/2-lW/2, logoY, lW, lH);
    logoY += lH+6;
  }catch(e){ logoY += 10; }

  /* brand name */
  ctx.font = F.brand(32);
  ctx.fillStyle = "#151515";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(cfg.brandName || "Hungry Owl", HX+HW/2, logoY);
  logoY += 36;

  /* tagline */
  ctx.font = F.label(10);
  ctx.fillStyle = "#151515";
  ctx.globalAlpha = 0.7;
  const tl = (cfg.tagline || "The Cloud Café").replace(/^—\s*/,'').replace(/\s*—$/,'').toUpperCase();
  ctx.fillText(tl.split('').join(' '), HX+HW/2, logoY);
  ctx.globalAlpha = 1;
  logoY += 16;

  /* short divider */
  ctx.strokeStyle="#151515"; ctx.lineWidth=2; ctx.globalAlpha=0.3;
  ctx.beginPath(); ctx.moveTo(HX+HW/2-30,logoY); ctx.lineTo(HX+HW/2+30,logoY); ctx.stroke();
  ctx.globalAlpha=1;

  /* ── GOLD STRIP ── */
  const GS1 = HY+HH+6;
  const grad1 = ctx.createLinearGradient(0,0,CW,0);
  grad1.addColorStop(0,"#0f0f0f"); grad1.addColorStop(0.2,G.gold);
  grad1.addColorStop(0.5,G.accent); grad1.addColorStop(0.8,G.gold); grad1.addColorStop(1,"#0f0f0f");
  ctx.fillStyle=grad1; ctx.fillRect(0,GS1,CW,GOLD_H);

  /* ── BODY ── */
  const BY = GS1+GOLD_H+2;
  const BX = 12, BW = CW-24;

  function drawSection(secs, colX, startY){
    let y = startY;
    secs.forEach(sec=>{
      /* section title pill */
      ctx.font = F.label(9);
      ctx.textAlign="center";
      const tw = ctx.measureText("● "+sec.name.toUpperCase()).width + 20;
      const tx = colX + COL/2 - tw/2;
      /* rules */
      ctx.strokeStyle=G.gold; ctx.lineWidth=1; ctx.globalAlpha=0.5;
      ctx.beginPath(); ctx.moveTo(colX,y+10); ctx.lineTo(tx-4,y+10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx+tw+4,y+10); ctx.lineTo(colX+COL,y+10); ctx.stroke();
      ctx.globalAlpha=1;
      /* pill */
      fillRR(tx,y,tw,20,3,G.black);
      strokeRR(tx,y,tw,20,3,G.gold,1.2);
      ctx.fillStyle=G.gold; ctx.font=F.label(8);
      ctx.fillText("● "+sec.name.toUpperCase(), colX+COL/2, y+5);
      y += 28;

      /* items */
      sec.items.forEach(it=>{
        const isBest = bestSet.has(it.id);
        /* dotted separator */
        ctx.strokeStyle=G.muted; ctx.lineWidth=1; ctx.setLineDash([2,3]);
        ctx.beginPath(); ctx.moveTo(colX,y+18); ctx.lineTo(colX+COL,y+18); ctx.stroke();
        ctx.setLineDash([]);
        /* bestseller dot */
        if(isBest){
          ctx.fillStyle=G.gold;
          ctx.beginPath(); ctx.arc(colX+4,y+8,3,0,Math.PI*2); ctx.fill();
        }
        /* name */
        ctx.font = F.item(11);
        ctx.fillStyle = G.cream;
        ctx.textAlign="left";
        const nameX = isBest ? colX+12 : colX+4;
        ctx.fillText(it.name, nameX, y);
        /* price */
        if(it.price > 0){
          ctx.font = F.price(11);
          ctx.fillStyle = G.gold;
          ctx.textAlign="right";
          ctx.fillText("₹"+it.price, colX+COL, y);
        }
        y += 22;
      });
      y += 14;
    });
    return y;
  }

  /* left column */
  drawSection(leftSecs, BX+6, BY+BODY_PAD);

  /* right column */
  const RX = BX+6+COL+16;
  let ry = drawSection(rightSecs, RX, BY+BODY_PAD);

  /* QR box */
  const QRX=RX, QRY=ry+4, QRBOXW=COL, QRBOXH=QR_H;
  fillRR(QRX,QRY,QRBOXW,QRBOXH,8,G.black);
  strokeRR(QRX,QRY,QRBOXW,QRBOXH,8,G.gold,1.5);
  /* glow */
  const rg = ctx.createRadialGradient(QRX+QRBOXW/2,QRY,5,QRX+QRBOXW/2,QRY,60);
  rg.addColorStop(0,"rgba(240,172,17,0.15)"); rg.addColorStop(1,"transparent");
  ctx.fillStyle=rg; fillRR(QRX,QRY,QRBOXW,QRBOXH,8,rg);
  /* QR image */
  const qrSize = 90;
  const qrX = QRX+QRBOXW/2-qrSize/2, qrY = QRY+10;
  try{
    const qrImg = await loadImg(BRAND_QR_B64);
    ctx.fillStyle="#fff"; fillRR(qrX-4,qrY-4,qrSize+8,qrSize+8,4,"#fff");
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }catch(e){}
  /* divider */
  ctx.strokeStyle=G.gold; ctx.lineWidth=1; ctx.globalAlpha=0.35;
  ctx.beginPath(); ctx.moveTo(QRX+QRBOXW/2-20,qrY+qrSize+8);
  ctx.lineTo(QRX+QRBOXW/2+20,qrY+qrSize+8); ctx.stroke();
  ctx.globalAlpha=1;
  /* label */
  ctx.font=F.label(8); ctx.fillStyle=G.gold; ctx.textAlign="center";
  ctx.fillText("SCAN TO ORDER ONLINE", QRX+QRBOXW/2, qrY+qrSize+14);
  ctx.font=F.item(7); ctx.fillStyle=G.white; ctx.globalAlpha=0.35;
  ctx.fillText("hungry-owl-menu.vercel.app", QRX+QRBOXW/2, qrY+qrSize+26);
  ctx.globalAlpha=1;

  /* bestseller legend */
  const legY = QRY+QRBOXH+8;
  ctx.fillStyle=G.gold;
  ctx.beginPath(); ctx.arc(RX+8,legY+5,3,0,Math.PI*2); ctx.fill();
  ctx.font=F.item(8); ctx.fillStyle=G.gold; ctx.textAlign="left"; ctx.globalAlpha=0.6;
  ctx.fillText("Bestsellers marked with dot", RX+16, legY);
  ctx.globalAlpha=1;

  /* ── GOLD STRIP 2 ── */
  const GS2 = BY+BODY_H+2;
  ctx.fillStyle=grad1; ctx.fillRect(0,GS2,CW,GOLD_H);

  /* ── FOOTER ── */
  const FY = GS2+GOLD_H+4;
  fillRR(6,FY,CW-12,FOOTER_H-6,6,G.gold);
  strokeRR(14,FY+5,CW-28,FOOTER_H-16,4,"#151515",2);
  ctx.font=F.label(9); ctx.fillStyle="#151515"; ctx.textAlign="left";
  ctx.fillText("GOOD FOOD · GOOD MOOD", 28, FY+17);
  ctx.textAlign="center";
  ctx.fillText("🦉  🦉  🦉", CW/2, FY+17);
  ctx.textAlign="right";
  ctx.fillText("THE CLOUD CAFÉ", CW-28, FY+17);

  return new Promise(resolve => canvas.toBlob(b=>resolve(b), "image/png"));
}

async function downloadMenu(){
  showToast("Generating premium menu…");
  try{
    const blob = await generateFullMenuImageBlob();
    downloadBlob(blob, "hungry-owl-menu.png");
    showToast("Menu downloaded ✅");
  }catch(e){
    showToast("Couldn't generate menu: "+e.message);
    console.error(e);
  }
}
document.getElementById("downloadMenuBtn").addEventListener("click", downloadMenu);


/* ---------------- MENU EDITOR ---------------- */
// Default template emojis per category keyword
const ITEM_TEMPLATES = {
  sandwich: ["🥪","🥙","🫓","🥗","🧆"],
  pasta: ["🍝","🍜","🫕","🍲","🥘"],
  maggi: ["🍜","🍲","🥣","🫕","🍝"],
  chai: ["☕","🫖","🧉","🥤","🍵"],
  coffee: ["☕","🧋","🫖","🍵","🥤"],
  bun: ["🥐","🥖","🧁","🥨","🍞"],
  egg: ["🍳","🥚","🥗","🍱","🥞"],
  burger: ["🍔","🫔","🥙","🍟","🌮"],
  pizza: ["🍕","🫓","🥙","🍔","🌮"],
  default: ["🍽️","🥗","🍲","🥘","🫕"],
};
function getTemplates(sectionName){
  const n = sectionName.toLowerCase();
  for(const [key, arr] of Object.entries(ITEM_TEMPLATES)){
    if(key !== "default" && n.includes(key)) return arr;
  }
  return ITEM_TEMPLATES.default;
}

function renderAdmin(){
  const wrap = document.getElementById("adminSections");
  const bestSet = new Set(window.__bestsellerIds || []);
  wrap.innerHTML = menu.sections.map((sec, sIdx) => {
    const templates = getTemplates(sec.name);
    return `
    <div class="admin-section-card" data-section="${sec.id}">
      <div class="admin-section-head">
        <span class="drag-handle drag-handle-section" title="Drag to reorder category">⠿</span>
        <button class="icon-btn ghost" data-act="sec-up" data-sid="${sec.id}" ${sIdx===0?'disabled':''}>↑</button>
        <button class="icon-btn ghost" data-act="sec-down" data-sid="${sec.id}" ${sIdx===menu.sections.length-1?'disabled':''}>↓</button>
        <input type="text" value="${escapeHtml(sec.name)}" data-act="sec-name" data-sid="${sec.id}" placeholder="Section name">
        <button class="icon-btn danger" data-act="sec-del" data-sid="${sec.id}" title="Delete section">🗑</button>
      </div>
      <div class="admin-items-list" data-items-of="${sec.id}">
      ${sec.items.map((it, iIdx) => {
        const isBest = bestSet.has(it.id);
        const thumb = it.image
          ? `<img class="admin-item-thumb" src="${it.image}" alt="">`
          : `<div class="admin-item-thumb admin-item-thumb--empty">📷</div>`;
        return `
        <div class="admin-item-row" data-item="${it.id}">
          <span class="drag-handle drag-handle-item" title="Drag to reorder item">⠿</span>
          <button class="icon-btn ghost" data-act="item-up" data-sid="${sec.id}" data-iid="${it.id}" ${iIdx===0?'disabled':''}>↑</button>
          <button class="icon-btn ghost" data-act="item-down" data-sid="${sec.id}" data-iid="${it.id}" ${iIdx===sec.items.length-1?'disabled':''}>↓</button>
          <div class="admin-item-image-wrap">
            ${thumb}
            <div class="admin-item-templates">${templates.map(t => `<button class="template-emoji-btn" data-act="item-img-template" data-sid="${sec.id}" data-iid="${it.id}" data-template="${t}">${t}</button>`).join("")}</div>
            <label class="icon-btn ghost img-upload-label" title="Upload photo">📷<input type="file" accept="image/*" data-act="item-img-upload" data-sid="${sec.id}" data-iid="${it.id}" style="display:none;"></label>
            ${it.image ? `<button class="icon-btn ghost" data-act="item-img-clear" data-sid="${sec.id}" data-iid="${it.id}" title="Remove image">✕</button>` : ""}
          </div>
          <input type="text" value="${escapeHtml(it.name)}" data-act="item-name" data-sid="${sec.id}" data-iid="${it.id}" placeholder="Item name">
          <input type="number" value="${it.price}" min="0" data-act="item-price" data-sid="${sec.id}" data-iid="${it.id}" placeholder="₹">
          <button class="icon-btn${isBest?' best-active':''}" data-act="item-best" data-sid="${sec.id}" data-iid="${it.id}" title="${isBest?'Remove bestseller':'Mark as bestseller'}">⭐</button>
          <button class="icon-btn danger" data-act="item-del" data-sid="${sec.id}" data-iid="${it.id}" title="Remove item">✕</button>
        </div>
      `}).join("")}
      </div>
      <button class="add-item-btn" data-act="item-add" data-sid="${sec.id}">+ Add item to "${escapeHtml(sec.name)}"</button>
    </div>
  `}).join("") || `<p class="hint">No sections yet — add one above to get started.</p>`;
}
function findSection(sid){ return menu.sections.find(s => s.id === sid); }
function findItem(sid, iid){ return findSection(sid).items.find(i => i.id === iid); }

/* ---------------- DRAG-TO-REORDER ---------------- */
(function setupDragReorder(){
  const root = document.getElementById("adminSections");
  let dragEl = null, placeholder = null, startY = 0, elStartTop = 0;
  let mode = null, listEl = null, itemSelector = null, sid = null;

  function siblingsOf(container, selector){
    return Array.from(container.children).filter(el => el.matches(selector));
  }

  root.addEventListener("pointerdown", (e) => {
    const sectionHandle = e.target.closest(".drag-handle-section");
    const itemHandle = e.target.closest(".drag-handle-item");
    if(!sectionHandle && !itemHandle) return;

    if(sectionHandle){
      dragEl = sectionHandle.closest(".admin-section-card");
      listEl = root; itemSelector = ".admin-section-card"; mode = "section"; sid = null;
    } else {
      dragEl = itemHandle.closest(".admin-item-row");
      listEl = itemHandle.closest(".admin-items-list");
      itemSelector = ".admin-item-row"; mode = "item";
      sid = listEl ? listEl.dataset.itemsOf : null;
    }
    if(!dragEl || !listEl) { dragEl = null; return; }

    e.preventDefault();
    const rect = dragEl.getBoundingClientRect();
    startY = e.clientY; elStartTop = rect.top;

    placeholder = document.createElement("div");
    placeholder.className = "drag-placeholder" + (mode === "item" ? " item-placeholder" : "");
    placeholder.style.height = rect.height + "px";
    dragEl.after(placeholder);

    dragEl.style.position = "fixed";
    dragEl.style.top = rect.top + "px";
    dragEl.style.left = rect.left + "px";
    dragEl.style.width = rect.width + "px";
    dragEl.style.zIndex = 999;
    dragEl.style.pointerEvents = "none";
    dragEl.classList.add("dragging-item");
    document.body.style.userSelect = "none";

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  function onMove(e){
    if(!dragEl) return;
    const dy = e.clientY - startY;
    dragEl.style.top = (elStartTop + dy) + "px";
    const siblings = siblingsOf(listEl, itemSelector).filter(el => el !== dragEl);
    let placed = false;
    for(const sib of siblings){
      if(sib === placeholder) continue;
      const rect = sib.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if(e.clientY < mid){ listEl.insertBefore(placeholder, sib); placed = true; break; }
    }
    if(!placed) listEl.appendChild(placeholder);
  }

  async function onUp(){
    if(!dragEl) return;
    listEl.insertBefore(dragEl, placeholder);
    placeholder.remove(); placeholder = null;

    dragEl.style.position = ""; dragEl.style.top = ""; dragEl.style.left = "";
    dragEl.style.width = ""; dragEl.style.zIndex = ""; dragEl.style.pointerEvents = "";
    dragEl.classList.remove("dragging-item");
    document.body.style.userSelect = "";

    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);

    if(mode === "section"){
      const ids = siblingsOf(listEl, itemSelector).map(el => el.dataset.section);
      menu.sections.sort((a,b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    } else {
      const ids = siblingsOf(listEl, itemSelector).map(el => el.dataset.item);
      const sec = findSection(sid);
      if(sec) sec.items.sort((a,b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    }

    dragEl = null; listEl = null; itemSelector = null; mode = null; sid = null;

    renderAdmin();
    await saveMenu();
    showToast("Order updated");
  }
})();

document.getElementById("adminSections").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if(!btn) return;
  const act = btn.dataset.act, sid = btn.dataset.sid, iid = btn.dataset.iid;

  if(act === "sec-del" || act === "item-del"){
    if(!btn.classList.contains("confirming")){
      btn.classList.add("confirming");
      btn.textContent = "✓?";
      showToast("Tap again to confirm delete");
      setTimeout(() => { btn.classList.remove("confirming"); btn.textContent = act==="sec-del" ? "🗑" : "✕"; }, 2500);
      return;
    }
  }

  if(act === "sec-del"){
    menu.sections = menu.sections.filter(s => s.id !== sid);
  } else if(act === "sec-up" || act === "sec-down"){
    const idx = menu.sections.findIndex(s => s.id === sid);
    const swap = act === "sec-up" ? idx-1 : idx+1;
    [menu.sections[idx], menu.sections[swap]] = [menu.sections[swap], menu.sections[idx]];
  } else if(act === "item-add"){
    findSection(sid).items.push({ id: uid("i"), name: "New item", price: 0 });
  } else if(act === "item-del"){
    const sec = findSection(sid);
    sec.items = sec.items.filter(i => i.id !== iid);
  } else if(act === "item-up" || act === "item-down"){
    const sec = findSection(sid);
    const idx = sec.items.findIndex(i => i.id === iid);
    const swap = act === "item-up" ? idx-1 : idx+1;
    [sec.items[idx], sec.items[swap]] = [sec.items[swap], sec.items[idx]];
  } else if(act === "item-best"){
    // toggle bestseller
    const ids = window.__bestsellerIds || [];
    const idx = ids.indexOf(iid);
    if(idx >= 0) ids.splice(idx, 1);
    else ids.push(iid);
    window.__bestsellerIds = ids;
    // save to site config
    const existing = window.__lastSiteConfig || {};
    const cfg = { ...existing, bestsellerIds: ids };
    try{
      await api.saveSiteConfig(adminPin, cfg);
      window.__lastSiteConfig = cfg;
      showToast(idx >= 0 ? "Removed from bestsellers" : "Added to bestsellers ⭐");
    }catch(err){ showToast("Couldn't save: " + err.message); }
    renderAdmin();
    return;
  } else if(act === "item-img-template"){
    const emoji = btn.dataset.template;
    const it = findItem(sid, iid);
    // Convert emoji to a small canvas data URL
    const canvas = document.createElement("canvas");
    canvas.width = 80; canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFF8E1";
    ctx.fillRect(0,0,80,80);
    ctx.font = "52px serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, 40, 44);
    it.image = canvas.toDataURL("image/png");
    renderAdmin();
    await saveMenu();
    showToast("Template image set");
    return;
  } else if(act === "item-img-clear"){
    findItem(sid, iid).image = "";
    renderAdmin();
    await saveMenu();
    return;
  } else return;

  renderAdmin();
  await saveMenu();
});

document.getElementById("adminSections").addEventListener("input", async (e) => {
  const el = e.target.closest("input[data-act]");
  if(!el) return;
  const act = el.dataset.act, sid = el.dataset.sid, iid = el.dataset.iid;
  if(act === "sec-name"){ findSection(sid).name = el.value; }
  else if(act === "item-name"){ findItem(sid, iid).name = el.value; }
  else if(act === "item-price"){ findItem(sid, iid).price = Math.max(0, Number(el.value) || 0); }
  else return;
  await saveMenu();
});

document.getElementById("adminSections").addEventListener("change", async (e) => {
  const input = e.target.closest("input[data-act='item-img-upload']");
  if(!input) return;
  const file = input.files[0];
  if(!file) return;
  try{
    const dataUrl = await readAndCompressImage(file);
    findItem(input.dataset.sid, input.dataset.iid).image = dataUrl;
    renderAdmin();
    await saveMenu();
    showToast("Item photo saved");
  }catch(err){ showToast("Couldn't use that image: " + err.message); }
  input.value = "";
});

document.getElementById("resetOrderCounterBtn").addEventListener("click", async function(){
  if(!this.classList.contains("confirming")){
    this.classList.add("confirming");
    this.textContent = "Tap again to confirm reset";
    showToast("Tap again to confirm — this can't be undone");
    setTimeout(() => {
      this.classList.remove("confirming");
      this.textContent = "Reset Order Counter to #1";
    }, 2500);
    return;
  }
  this.classList.remove("confirming");
  this.textContent = "Reset Order Counter to #1";
  try{
    await api.resetOrderCounter(adminPin);
    document.getElementById("orderCounterHint").textContent = "✅ Counter reset — next order will be #1.";
    showToast("Order counter reset to #1");
  }catch(err){
    document.getElementById("orderCounterHint").textContent = "Couldn't reset: " + err.message;
  }
});

document.getElementById("addSectionBtn").addEventListener("click", async () => {
  const input = document.getElementById("newSectionInput");
  const name = input.value.trim();
  if(!name){ showToast("Type a section name first"); return; }
  menu.sections.push({ id: uid("s"), name, items: [] });
  input.value = "";
  renderAdmin();
  await saveMenu();
  showToast("Section added");
});
document.getElementById("newSectionInput").addEventListener("keydown", (e) => {
  if(e.key === "Enter") document.getElementById("addSectionBtn").click();
});

const DEFAULT_MENU = {
  sections: [
    { id: "s1", name: "Hot Beverages", items: [
      { id: "i1", name: "Chai", price: 15 },
      { id: "i2", name: "Cutting Chai", price: 10 },
      { id: "i3", name: "Masala Chai", price: 20 },
      { id: "i4", name: "Hot Coffee", price: 30 },
      { id: "i5", name: "Hot Chocolate", price: 90 },
    ]},
    { id: "s2", name: "Buns", items: [
      { id: "i6", name: "Bun Maska", price: 30 },
      { id: "i7", name: "Bun Makkhan", price: 30 },
    ]},
    { id: "s3", name: "Maggi", items: [
      { id: "i8", name: "Plain Maggi", price: 35 },
      { id: "i9", name: "Veg Maggi", price: 40 },
      { id: "i10", name: "Cheese Maggi", price: 60 },
    ]},
    { id: "s4", name: "Sandwiches", items: [
      { id: "i11", name: "Potato Veggies Grilled Sandwich", price: 40 },
      { id: "i12", name: "Veg Grilled Sandwich", price: 50 },
      { id: "i13", name: "Cheese Grilled Sandwich", price: 70 },
      { id: "i14", name: "Paneer Grilled Sandwich", price: 70 },
    ]},
    { id: "s5", name: "Egg Items", items: [
      { id: "i15", name: "Plain Omelette", price: 35 },
      { id: "i16", name: "Bun Omelette", price: 40 },
      { id: "i17", name: "Bread Omelette", price: 40 },
    ]},
  ]
};

document.getElementById("resetBtn").addEventListener("click", async function(){
  if(!this.classList.contains("confirming")){
    this.classList.add("confirming");
    this.textContent = "Tap again to confirm reset";
    showToast("Tap again to confirm reset");
    setTimeout(() => { this.classList.remove("confirming"); this.textContent = "Reset to Default Menu"; }, 2500);
    return;
  }
  this.classList.remove("confirming");
  this.textContent = "Reset to Default Menu";
  menu = structuredClone(DEFAULT_MENU);
  renderAdmin();
  await saveMenu();
  showToast("Menu reset");
});
