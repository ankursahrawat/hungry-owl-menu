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

/* ---------------- INIT ---------------- */
async function initAdminScreen(){
  await renderStatus();
  await Promise.all([loadAndRenderMenu(), loadAndPopulateBranding()]);
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
async function generateFullMenuImageBlob(){
  const cfg = window.__lastSiteConfig || {};
  const cssWidth = 640;
  const padding = 32;
  const lineHeight = 30;
  const sectionGap = 22;
  const sectionTitleGap = 12;
  const scale = 2;

  const measureCanvas = document.createElement("canvas");
  const mctx = measureCanvas.getContext("2d");

  const brandName = cfg.brandName || "Menu";
  const tagline = cfg.tagline || "";
  const hasLogo = !!cfg.logoImage;
  const logoSize = 64;
  const titleAreaX = padding + (hasLogo ? logoSize + 16 : 0);

  let titleFont = 40;
  mctx.font = `bold ${titleFont}px Georgia, serif`;
  const titleMaxWidth = cssWidth - titleAreaX - padding - (cfg.phone ? 140 : 0);
  while(titleFont > 22 && mctx.measureText(brandName).width > titleMaxWidth){
    titleFont -= 2;
    mctx.font = `bold ${titleFont}px Georgia, serif`;
  }

  mctx.font = "18px Arial";
  const taglineLines = tagline ? wrapText(mctx, tagline, cssWidth - titleAreaX - padding, 2) : [];

  mctx.font = "19px Arial";
  const priceColWidth = 90;
  const itemNameMaxWidth = cssWidth - padding*2 - 20 - priceColWidth;
  const sectionLayouts = menu.sections.map(sec => {
    const items = sec.items.length ? sec.items.map(it => {
      mctx.font = "19px Arial";
      const priceStr = money(it.price);
      const lines = wrapText(mctx, it.name, itemNameMaxWidth, 2);
      return { name: it.name, priceStr, lines };
    }) : [{ placeholder: true, lines: ["No items yet"] }];
    const itemLines = items.reduce((sum, it) => sum + it.lines.length, 0);
    return { name: sec.name, items, itemLines };
  });

  const headerHeight = 60 + titleFont + 14 + (taglineLines.length * 24) + 26;
  const contentHeight = sectionLayouts.reduce((sum, sec) =>
    sum + sectionTitleGap + 28 + (sec.itemLines * lineHeight) + sectionGap, 0);
  const footerHeight = 46;
  const cssHeight = Math.round(headerHeight + contentHeight + footerHeight + padding);

  const canvas = document.createElement("canvas");
  canvas.width = cssWidth * scale;
  canvas.height = cssHeight * scale;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const width = cssWidth, height = cssHeight;

  ctx.fillStyle = "#FBF5E6"; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = "#201A10"; ctx.lineWidth = 6;
  ctx.strokeRect(3,3,width-6,height-6);
  ctx.strokeStyle = "#D9A62E"; ctx.lineWidth = 1.5;
  ctx.strokeRect(10,10,width-20,height-20);

  if(hasLogo){
    try{
      const img = await loadImageEl(cfg.logoImage);
      ctx.save();
      drawRoundedRect(ctx, padding, padding, logoSize, logoSize, logoSize/2);
      ctx.clip();
      ctx.drawImage(img, padding, padding, logoSize, logoSize);
      ctx.restore();
      ctx.strokeStyle = "#201A10"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(padding+logoSize/2, padding+logoSize/2, logoSize/2, 0, Math.PI*2);
      ctx.stroke();
    }catch(e){ /* skip logo if it fails to load */ }
  }

  ctx.textBaseline = "top";
  ctx.fillStyle = "#201A10";
  ctx.font = `bold ${titleFont}px Georgia, serif`;
  ctx.textAlign = "left";
  ctx.fillText(brandName, titleAreaX, padding - 4);

  let ty = padding + titleFont + 8;
  ctx.font = "18px Arial";
  ctx.fillStyle = "#8a7c58";
  taglineLines.forEach(line => { ctx.fillText(line, titleAreaX, ty); ty += 24; });

  if(cfg.phone){
    ctx.textAlign = "right";
    ctx.font = "16px Arial";
    ctx.fillStyle = "#201A10";
    ctx.fillText("📞 " + cfg.phone, width-padding, padding);
    ctx.textAlign = "left";
  }

  const dividerY = Math.max(padding + logoSize + 14, ty + 10);
  ctx.strokeStyle = "#C7AD70";
  ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(padding, dividerY); ctx.lineTo(width-padding, dividerY); ctx.stroke();
  ctx.setLineDash([]);

  let y = dividerY + 26;
  sectionLayouts.forEach(sec => {
    ctx.font = "bold 23px Georgia, serif";
    ctx.fillStyle = "#B0453B";
    ctx.fillText(sec.name.toUpperCase(), padding, y);
    y += 28 + sectionTitleGap - 12;

    sec.items.forEach(it => {
      if(it.placeholder){
        ctx.font = "italic 17px Arial";
        ctx.fillStyle = "#8a7c58";
        ctx.fillText(it.lines[0], padding+10, y);
        y += lineHeight;
        return;
      }
      ctx.font = "19px Arial";
      ctx.fillStyle = "#201A10";
      ctx.textAlign = "right";
      ctx.fillText(it.priceStr, width-padding, y);
      ctx.textAlign = "left";
      it.lines.forEach(line => { ctx.fillText(line, padding+10, y); y += lineHeight; });
    });
    y += sectionGap - 12;
  });

  ctx.strokeStyle = "#C7AD70";
  ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.moveTo(padding, height-footerHeight+8); ctx.lineTo(width-padding, height-footerHeight+8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "italic 15px Arial";
  ctx.fillStyle = "#8a7c58";
  ctx.textAlign = "center";
  ctx.fillText("Prices may change without notice", width/2, height-footerHeight+22);
  ctx.textAlign = "left";

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/png"));
}
document.getElementById("downloadMenuBtn").addEventListener("click", async () => {
  showToast("Preparing menu image…");
  try{
    const blob = await generateFullMenuImageBlob();
    downloadBlob(blob, "menu.png");
    showToast("Menu downloaded");
  }catch(e){
    showToast("Couldn't generate the menu image: " + e.message);
  }
});

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
