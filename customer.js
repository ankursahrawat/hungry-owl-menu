/* ---------------- STATE ---------------- */
let menu = { sections: [] };
let cart = {};
let sectionObserver = null;
let bestsellerIds = [];      // populated from site config

/* ---------------- LOAD + LIVE POLLING ---------------- */
async function loadMenu(){
  try{
    menu = await api.getMenu();
  }catch(e){
    document.getElementById("menuArea").innerHTML =
      `<div class="empty-note">Couldn't load the menu right now (${escapeHtml(e.message)}). Pull to refresh in a moment.</div>`;
    return;
  }
  renderPublicMenu();
}

async function loadBranding(){
  try{
    const cfg = await api.getSiteConfig();
    window.__lastCfg = cfg;
    bestsellerIds = Array.isArray(cfg.bestsellerIds) ? cfg.bestsellerIds : [];
    applySiteConfig(cfg);
    renderContactBar(cfg);
  }catch(e){ /* keep defaults already in the HTML if this fails */ }
}

// Customers don't get push updates from the admin panel, so we poll
// periodically and whenever the tab regains focus.
const POLL_MS = 15000;
setInterval(() => { loadMenu(); loadBranding(); }, POLL_MS);
document.addEventListener("visibilitychange", () => { if(!document.hidden){ loadMenu(); loadBranding(); } });
window.addEventListener("focus", () => { loadMenu(); loadBranding(); });

/* ---------------- CONTACT BAR ---------------- */
let shopPhone = "9193080069"; // fallback, overwritten by site config
function renderContactBar(cfg){
  const bar = document.getElementById("contactBar");
  if(!bar) return;
  shopPhone = (cfg.phone || "").replace(/\D/g,"") || shopPhone;
  bar.innerHTML = `
    <a class="contact-btn contact-call" href="tel:+${shopPhone}">📞 Call</a>
    <a class="contact-btn contact-wa" href="https://wa.me/${shopPhone}" target="_blank" rel="noopener">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-2px;margin-right:4px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      WhatsApp
    </a>
  `;
}

/* ---------------- PUBLIC MENU RENDER ---------------- */
function allItemsFlat(){
  const map = {};
  menu.sections.forEach(s => s.items.forEach(it => { map[it.id] = it; }));
  return map;
}

function renderItemRow(it){
  const qty = cart[it.id] || 0;
  const isBest = bestsellerIds.includes(it.id);
  const control = qty > 0
    ? `<div class="item-qty-stepper">
         <button data-cart-act="dec" data-iid="${it.id}">−</button>
         <span class="qty-num">${qty}</span>
         <button data-cart-act="inc" data-iid="${it.id}">+</button>
       </div>`
    : `<button class="item-add-btn" data-cart-act="inc" data-iid="${it.id}">Add <span>+</span></button>`;
  const imgHtml = it.image
    ? `<img class="item-thumb" src="${it.image}" alt="${escapeHtml(it.name)}" loading="lazy">`
    : "";
  const bestBadge = isBest ? `<span class="best-badge">⭐ Bestseller</span>` : "";
  return `
    <div class="item-row">
      ${imgHtml}
      <div class="item-info">
        ${bestBadge}
        <span class="item-name">${escapeHtml(it.name)}</span>
      </div>
      <span class="dots"></span>
      <span class="item-price">${money(it.price)}</span>
      ${control}
    </div>`;
}

function renderPublicMenu(){
  const area = document.getElementById("menuArea");
  if(!menu.sections.length){
    area.innerHTML = `<div class="empty-note">The menu is empty right now — check back soon.</div>`;
    renderCatRail();
    return;
  }

  // Bestseller virtual section (only shown if any IDs marked)
  const allItems = allItemsFlat();
  const bestItems = bestsellerIds.map(id => allItems[id]).filter(Boolean);
  const bestSection = bestItems.length
    ? `<div class="section" id="section-bestsellers">
         <div class="section-title-row">
           <div class="rule"></div><div class="pill pill-best">⭐ Bestsellers</div><div class="rule"></div>
         </div>
         ${bestItems.map(it => renderItemRow(it)).join("")}
       </div>`
    : "";

  area.innerHTML = bestSection + menu.sections.map(sec => `
    <div class="section" id="section-${sec.id}">
      <div class="section-title-row">
        <div class="rule"></div><div class="pill">${escapeHtml(sec.name)}</div><div class="rule"></div>
      </div>
      ${ sec.items.length
          ? sec.items.map(it => renderItemRow(it)).join("")
          : `<div class="empty-note">No items yet in this section.</div>`
      }
    </div>
  `).join("");
  renderCatRail();
  observeSections();
}

/* ---------------- CATEGORY ICON RAIL ---------------- */
const CATEGORY_ICONS = [
  { match: /sandwich|grill|toast/i, icon: "🥪" },
  { match: /pasta|macroni|macaroni|noodle/i, icon: "🍝" },
  { match: /maggi/i, icon: "🍜" },
  { match: /chai|coffee|tea|beverage|drink|shake|juice/i, icon: "☕" },
  { match: /bun|bread|pastry|bakery/i, icon: "🥐" },
  { match: /roll|wrap/i, icon: "🌯" },
  { match: /pizza/i, icon: "🍕" },
  { match: /burger/i, icon: "🍔" },
  { match: /rice|biryani/i, icon: "🍚" },
  { match: /dessert|sweet|ice ?cream/i, icon: "🍨" },
  { match: /soup/i, icon: "🥣" },
  { match: /egg/i, icon: "🍳" },
];
function pickCategoryIcon(name){
  const hit = CATEGORY_ICONS.find(c => c.match.test(name));
  return hit ? hit.icon : "🍽️";
}

function renderCatRail(){
  const rail = document.getElementById("catRail");
  if(!menu.sections.length){ rail.innerHTML = ""; return; }

  // Bestseller entry only shown when there are bestsellers
  const allItems = allItemsFlat();
  const hasBest = bestsellerIds.some(id => allItems[id]);
  const bestBtn = hasBest
    ? `<button class="cat-rail-btn" data-target="section-bestsellers">
         <span class="cat-rail-icon cat-rail-icon--best">⭐</span>
         <span class="cat-rail-label">Best</span>
       </button>
       <div class="cat-rail-divider"></div>`
    : "";

  // "Menu" label header
  const menuLabel = `<div class="cat-rail-menu-label">Menu</div>`;

  const prevActive = rail.querySelector(".cat-rail-btn.active")?.dataset.target;
  rail.innerHTML = bestBtn + menuLabel + menu.sections.map((sec, i) => {
    const target = `section-${sec.id}`;
    const active = prevActive ? target === prevActive : (!hasBest && i === 0);
    return `<button class="cat-rail-btn${active?' active':''}" data-target="${target}">
              <span class="cat-rail-icon">${pickCategoryIcon(sec.name)}</span>
              <span class="cat-rail-label">${escapeHtml(sec.name)}</span>
            </button>`;
  }).join("");
}

document.getElementById("catRail").addEventListener("click", (e) => {
  const btn = e.target.closest(".cat-rail-btn");
  if(!btn) return;
  const target = document.getElementById(btn.dataset.target);
  if(target){
    const y = target.getBoundingClientRect().top + window.scrollY - 14;
    window.scrollTo({ top: y, behavior: "smooth" });
  }
});

function observeSections(){
  if(sectionObserver) sectionObserver.disconnect();
  const sections = Array.from(document.querySelectorAll(".section"));
  if(!sections.length) return;
  sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting){
        const id = entry.target.id;
        document.querySelectorAll(".cat-rail-btn").forEach(p => {
          p.classList.toggle("active", p.dataset.target === id);
        });
      }
    });
  }, { rootMargin: "-120px 0px -70% 0px", threshold: 0 });
  sections.forEach(s => sectionObserver.observe(s));
}

/* ---------------- CART ---------------- */
function cartCount(){ return Object.values(cart).reduce((a,b) => a+b, 0); }
function cartTotal(){
  const items = allItemsFlat();
  return Object.entries(cart).reduce((sum,[id,qty]) => sum + (items[id] ? items[id].price*qty : 0), 0);
}
function updateCartFab(){
  const fab = document.getElementById("cartFab");
  const count = cartCount();
  if(count > 0){
    fab.innerHTML = `<span class="cart-fab-main">🛒 ${count} item${count>1?'s':''} · ${money(cartTotal())}</span><span class="cart-fab-sub">CHECKOUT →</span>`;
    fab.style.display = "flex";
  } else {
    fab.style.display = "none";
  }
}

document.getElementById("menuArea").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-cart-act]");
  if(!btn) return;
  const iid = btn.dataset.iid;
  const act = btn.dataset.cartAct;
  const items = allItemsFlat();
  if(!items[iid]) return;
  if(act === "inc"){ cart[iid] = (cart[iid] || 0) + 1; }
  else if(act === "dec"){ cart[iid] = (cart[iid] || 0) - 1; if(cart[iid] <= 0) delete cart[iid]; }
  renderPublicMenu();
  updateCartFab();
});

function renderCart(){
  const wrap = document.getElementById("cartItems");
  const items = allItemsFlat();
  const entries = Object.entries(cart).filter(([id]) => items[id]);
  if(!entries.length){
    wrap.innerHTML = `<div class="empty-cart">Your order is empty — tap the "+" next to any item on the menu to add it.</div>`;
    document.getElementById("cartTotalRow").style.display = "none";
    document.getElementById("sendOrderBtn").disabled = true;
    return;
  }
  document.getElementById("sendOrderBtn").disabled = false;
  wrap.innerHTML = entries.map(([id, qty]) => {
    const it = items[id];
    return `
      <div class="order-row">
        <span class="oname">${escapeHtml(it.name)}</span>
        <div class="item-qty-stepper">
          <button data-cart-act="dec" data-iid="${id}">−</button>
          <span class="qty-num">${qty}</span>
          <button data-cart-act="inc" data-iid="${id}">+</button>
        </div>
        <span class="oprice">${money(it.price*qty)}</span>
      </div>`;
  }).join("");
  document.getElementById("cartTotalRow").style.display = "flex";
  document.getElementById("cartTotal").textContent = money(cartTotal());
}

document.getElementById("cartItems").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-cart-act]");
  if(!btn) return;
  const iid = btn.dataset.iid;
  const act = btn.dataset.cartAct;
  if(act === "inc"){ cart[iid] = (cart[iid] || 0) + 1; }
  else if(act === "dec"){ cart[iid] = (cart[iid] || 0) - 1; if(cart[iid] <= 0) delete cart[iid]; }
  renderCart();
  renderPublicMenu();
  updateCartFab();
});

const cartBackdrop = document.getElementById("cartBackdrop");
document.getElementById("cartFab").addEventListener("click", () => {
  renderCart();
  document.getElementById("sendOrderHint").textContent = "";
  cartBackdrop.classList.add("open");
});
document.getElementById("cartClose").addEventListener("click", () => cartBackdrop.classList.remove("open"));
cartBackdrop.addEventListener("click", (e) => { if(e.target === cartBackdrop) cartBackdrop.classList.remove("open"); });

/* ---------------- ORDER NUMBERING ---------------- */
function formatOrderNo(n){ return "#" + String(n).padStart(4, "0"); }

/* ---------------- ORDER IMAGE GENERATION ---------------- */
async function generateOrderImageBlob(orderNo){
  const items = allItemsFlat();
  const entries = Object.entries(cart).filter(([id]) => items[id]);
  const note = document.getElementById("orderNote").value.trim();
  const cssWidth = 600;
  const lineHeight = 34;
  const headerHeight = note ? 210 : 180;
  const footerHeight = 90;
  const cssHeight = headerHeight + entries.length*lineHeight + footerHeight;

  const scale = 2;
  const canvas = document.getElementById("orderCanvas");
  canvas.width = cssWidth * scale; canvas.height = cssHeight * scale;
  canvas.style.width = cssWidth + "px"; canvas.style.height = cssHeight + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const width = cssWidth, height = cssHeight;

  ctx.fillStyle = "#FBF5E6"; ctx.fillRect(0,0,width,height);
  ctx.strokeStyle = "#201A10"; ctx.lineWidth = 6;
  ctx.strokeRect(3,3,width-6,height-6);

  ctx.fillStyle = "#201A10";
  ctx.font = "bold 34px Georgia, serif";
  ctx.textBaseline = "top";
  ctx.fillText(`${document.getElementById("brandName").textContent} — New Order`, 30, 30);

  ctx.font = "bold 20px Arial";
  ctx.fillStyle = "#B0453B";
  ctx.textAlign = "right";
  ctx.fillText(formatOrderNo(orderNo), width-30, 34);
  ctx.textAlign = "left";

  ctx.font = "16px Arial";
  ctx.fillStyle = "#6b6142";
  const now = new Date();
  ctx.fillText(now.toLocaleString(), 30, 74);
  if(note){
    ctx.fillStyle = "#201A10";
    ctx.font = "bold 18px Arial";
    ctx.fillText("Name: " + fitText(ctx, note, width-60), 30, 100);
  }

  ctx.strokeStyle = "#C7AD70";
  ctx.setLineDash([4,4]);
  ctx.beginPath();
  ctx.moveTo(30, headerHeight-16); ctx.lineTo(width-30, headerHeight-16);
  ctx.stroke();
  ctx.setLineDash([]);

  let y = headerHeight;
  entries.forEach(([id, qty]) => {
    const it = items[id];
    const priceStr = money(it.price*qty);
    ctx.font = "20px Arial";
    const priceWidth = ctx.measureText(priceStr).width;
    ctx.fillStyle = "#201A10";
    ctx.textAlign = "left";
    ctx.fillText(fitText(ctx, `${qty} × ${it.name}`, width-60-priceWidth-16), 30, y+6);
    ctx.textAlign = "right";
    ctx.fillText(priceStr, width-30, y+6);
    y += lineHeight;
  });

  ctx.strokeStyle = "#201A10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, y+10); ctx.lineTo(width-30, y+10);
  ctx.stroke();

  ctx.font = "bold 26px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText("Total", 30, y+28);
  ctx.textAlign = "right";
  ctx.fillText(money(cartTotal()), width-30, y+28);

  return new Promise(resolve => canvas.toBlob((blob) => resolve(blob), "image/png"));
}

/* ---------------- SEND ORDER ---------------- */
document.getElementById("sendOrderBtn").addEventListener("click", async () => {
  const btn = document.getElementById("sendOrderBtn");
  const hint = document.getElementById("sendOrderHint");
  const items = allItemsFlat();
  const entries = Object.entries(cart).filter(([id]) => items[id]);

  if (!entries.length) return;

  const noteInput = document.getElementById("orderNote");

  if (!noteInput.value.trim()) {
    hint.textContent = "⚠️ Please enter your name before sending the order.";
    noteInput.focus();
    noteInput.style.borderColor = "var(--red)";
    return;
  }

  noteInput.style.borderColor = "";

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Preparing order...";
  hint.textContent = "";

  try {
    // Keep order numbering
    const { orderNo } = await api.nextOrderNumber();
    const orderLabel = formatOrderNo(orderNo);

    const note = noteInput.value.trim();

    const captionLines = entries.map(([id, qty]) => {
      const item = items[id];
      return `• ${item.name} × ${qty} = ${money(item.price * qty)}`;
    });

    const orderText =
`🦉 *Hungry Owl - Order ${orderLabel}*

📅 ${new Date().toLocaleString()}

👤 Name: ${note}

🍽️ *Items*
${captionLines.join("\n")}

💰 *Total: ${money(cartTotal())}`;

    btn.textContent = "Opening WhatsApp...";

    const phone = "919193080069";

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(orderText)}`,
      "_blank"
    );

    hint.textContent = `✅ WhatsApp opened successfully.`;

    cart = {};
    renderPublicMenu();
    updateCartFab();

    btn.textContent = originalText;
    btn.disabled = false;

  } catch (err) {
    hint.textContent =
      "Something went wrong generating the order: " + err.message;

    btn.textContent = originalText;
    btn.disabled = false;
  }
});
/* ---------------- INIT ---------------- */
(async () => {
  await loadBranding();
  await loadMenu();
})();

/* ---------------- DOWNLOAD MENU (customer page) ---------------- */
document.getElementById("downloadMenuFab").addEventListener("click", async () => {
  showToast("Generating menu…");
  try {
    const blob = await generateCustomerMenuBlob();
    downloadBlob(blob, "hungry-owl-menu.png");
    showToast("Menu downloaded ✅");
  } catch(e) {
    showToast("Couldn't generate menu: " + e.message);
  }
});

async function generateCustomerMenuBlob(){
  const cfg     = window.__lastCfg || {};
  const bestSet = new Set(bestsellerIds || []);
  const scale   = 3;
  const CW      = 660;
  const COL     = (CW-80)/2;

  function loadImg(src){
    return new Promise((res,rej)=>{
      const img=new Image(); img.crossOrigin="anonymous";
      img.onload=()=>res(img); img.onerror=rej; img.src=src;
    });
  }

  const BRAND_LOGO_B64 = "/brand-logo.svg";
  const BRAND_QR_B64   = "/brand-qr.svg";

  const allSections = menu.sections.map(sec=>({
    ...sec, items: sec.items.length ? sec.items : [{id:"_",name:"Coming soon",price:0}]
  }));
  const half      = Math.ceil(allSections.length/2);
  const leftSecs  = allSections.slice(0,half);
  const rightSecs = allSections.slice(half);

  function secH(secs){ return secs.reduce((h,s)=>h+30+s.items.length*22+14,0); }

  const HEADER_H=230, BODY_PAD=22, QR_H=160, FOOTER_H=50, GOLD_H=5;
  const BODY_H = Math.max(secH(leftSecs), secH(rightSecs)+QR_H+36) + BODY_PAD*2;
  const CH     = HEADER_H+GOLD_H+BODY_H+GOLD_H+FOOTER_H+16;

  const canvas=document.createElement("canvas");
  canvas.width=CW*scale; canvas.height=CH*scale;
  const ctx=canvas.getContext("2d");
  ctx.scale(scale,scale);

  const G={black:"#0f0f0f",gold:"#F0AC11",accent:"#FFC52E",cream:"#d4c9a8",
           muted:"rgba(240,172,17,0.12)",white:"#ffffff"};
  const F={
    brand:(s)=>`900 ${s}px Arial,sans-serif`,
    label:(s)=>`800 ${s}px Arial,sans-serif`,
    item: (s)=>`600 ${s}px Arial,sans-serif`,
    price:(s)=>`900 ${s}px Arial,sans-serif`,
  };
  function rr(x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y);
    ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }
  function fRR(x,y,w,h,r,c){ rr(x,y,w,h,r); ctx.fillStyle=c; ctx.fill(); }
  function sRR(x,y,w,h,r,c,lw){ rr(x,y,w,h,r); ctx.strokeStyle=c; ctx.lineWidth=lw; ctx.stroke(); }

  /* shell */
  fRR(0,0,CW,CH,3,G.black);
  sRR(1,1,CW-2,CH-2,3,G.gold,2);
  sRR(5,5,CW-10,CH-10,2,"rgba(240,172,17,0.3)",1);

  /* header */
  const HX=6,HY=6,HW=CW-12,HH=HEADER_H;
  fRR(HX,HY,HW,HH,16,G.gold);
  ctx.save(); rr(HX,HY,HW,HH,16); ctx.clip();
  ctx.strokeStyle="rgba(0,0,0,0.045)"; ctx.lineWidth=1;
  for(let i=-HH;i<HW+HH;i+=18){ ctx.beginPath(); ctx.moveTo(HX+i,HY); ctx.lineTo(HX+i+HH,HY+HH); ctx.stroke(); }
  ctx.restore();
  sRR(HX+8,HY+8,HW-16,HH-16,10,"#151515",2.5);
  sRR(HX+13,HY+13,HW-26,HH-26,7,"rgba(0,0,0,0.18)",1);
  [[HX+20,HY+20,1,1],[HX+HW-20,HY+20,-1,1],[HX+20,HY+HH-20,1,-1],[HX+HW-20,HY+HH-20,-1,-1]].forEach(([cx,cy,dx,dy])=>{
    ctx.strokeStyle="#151515"; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+dx*12,cy); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+dy*12); ctx.stroke();
  });

  let logoY=HY+18;
  try{
    const logoImg=await loadImg(cfg.logoImage||BRAND_LOGO_B64);
    const lH=88,lW=lH*(836/1254);
    ctx.drawImage(logoImg,HX+HW/2-lW/2,logoY,lW,lH); logoY+=lH+6;
  }catch(e){ logoY+=10; }

  ctx.font=F.brand(30); ctx.fillStyle="#151515"; ctx.textAlign="center"; ctx.textBaseline="top";
  ctx.fillText(cfg.brandName||"Hungry Owl",HX+HW/2,logoY); logoY+=34;
  ctx.font=F.label(9); ctx.fillStyle="#151515"; ctx.globalAlpha=0.7;
  const tl=((cfg.tagline||"The Cloud Café").replace(/^—\s*/,'').replace(/\s*—$/,'')).toUpperCase();
  ctx.fillText(tl.split('').join(' '),HX+HW/2,logoY); ctx.globalAlpha=1; logoY+=16;
  ctx.strokeStyle="#151515"; ctx.lineWidth=2; ctx.globalAlpha=0.3;
  ctx.beginPath(); ctx.moveTo(HX+HW/2-30,logoY); ctx.lineTo(HX+HW/2+30,logoY); ctx.stroke(); ctx.globalAlpha=1;

  const GS1=HY+HH+6;
  const grd=ctx.createLinearGradient(0,0,CW,0);
  grd.addColorStop(0,"#0f0f0f"); grd.addColorStop(0.2,G.gold); grd.addColorStop(0.5,G.accent);
  grd.addColorStop(0.8,G.gold); grd.addColorStop(1,"#0f0f0f");
  ctx.fillStyle=grd; ctx.fillRect(0,GS1,CW,GOLD_H);

  const BY=GS1+GOLD_H+2,BX=12;

  function drawSections(secs,colX,startY){
    let y=startY;
    secs.forEach(sec=>{
      ctx.font=F.label(8); ctx.textAlign="center";
      const tw=ctx.measureText("● "+sec.name.toUpperCase()).width+20;
      const tx=colX+COL/2-tw/2;
      ctx.strokeStyle=G.gold; ctx.lineWidth=1; ctx.globalAlpha=0.5;
      ctx.beginPath(); ctx.moveTo(colX,y+10); ctx.lineTo(tx-4,y+10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx+tw+4,y+10); ctx.lineTo(colX+COL,y+10); ctx.stroke();
      ctx.globalAlpha=1;
      fRR(tx,y,tw,20,3,G.black); sRR(tx,y,tw,20,3,G.gold,1.2);
      ctx.fillStyle=G.gold; ctx.font=F.label(8);
      ctx.fillText("● "+sec.name.toUpperCase(),colX+COL/2,y+5); y+=28;
      sec.items.forEach(it=>{
        const isBest=bestSet.has(it.id);
        ctx.strokeStyle=G.muted; ctx.lineWidth=1; ctx.setLineDash([2,3]);
        ctx.beginPath(); ctx.moveTo(colX,y+18); ctx.lineTo(colX+COL,y+18); ctx.stroke();
        ctx.setLineDash([]);
        if(isBest){ ctx.fillStyle=G.gold; ctx.beginPath(); ctx.arc(colX+4,y+8,3,0,Math.PI*2); ctx.fill(); }
        ctx.font=F.item(11); ctx.fillStyle=G.cream; ctx.textAlign="left";
        ctx.fillText(it.name, isBest?colX+12:colX+4, y);
        if(it.price>0){ ctx.font=F.price(11); ctx.fillStyle=G.gold; ctx.textAlign="right"; ctx.fillText("₹"+it.price,colX+COL,y); }
        y+=22;
      });
      y+=14;
    });
    return y;
  }

  drawSections(leftSecs, BX+6, BY+BODY_PAD);
  let ry=drawSections(rightSecs, BX+6+COL+16, BY+BODY_PAD);

  const RX=BX+6+COL+16,QRY=ry+4,QRBOXW=COL;
  fRR(RX,QRY,QRBOXW,QR_H,8,G.black); sRR(RX,QRY,QRBOXW,QR_H,8,G.gold,1.5);
  const qrSize=88,qrX=RX+QRBOXW/2-qrSize/2,qrY=QRY+10;
  try{
    const qrImg=await loadImg(BRAND_QR_B64);
    fRR(qrX-4,qrY-4,qrSize+8,qrSize+8,4,"#fff");
    ctx.drawImage(qrImg,qrX,qrY,qrSize,qrSize);
  }catch(e){}
  ctx.strokeStyle=G.gold; ctx.lineWidth=1; ctx.globalAlpha=0.35;
  ctx.beginPath(); ctx.moveTo(RX+QRBOXW/2-18,qrY+qrSize+8); ctx.lineTo(RX+QRBOXW/2+18,qrY+qrSize+8); ctx.stroke(); ctx.globalAlpha=1;
  ctx.font=F.label(8); ctx.fillStyle=G.gold; ctx.textAlign="center";
  ctx.fillText("SCAN TO ORDER ONLINE",RX+QRBOXW/2,qrY+qrSize+14);
  ctx.font=F.item(7); ctx.fillStyle=G.white; ctx.globalAlpha=0.35;
  ctx.fillText("hungry-owl-menu.vercel.app",RX+QRBOXW/2,qrY+qrSize+26); ctx.globalAlpha=1;

  const GS2=BY+BODY_H+2;
  ctx.fillStyle=grd; ctx.fillRect(0,GS2,CW,GOLD_H);

  const FY=GS2+GOLD_H+4;
  fRR(6,FY,CW-12,FOOTER_H-6,6,G.gold);
  sRR(14,FY+5,CW-28,FOOTER_H-16,4,"#151515",2);
  ctx.font=F.label(9); ctx.fillStyle="#151515";
  ctx.textAlign="left"; ctx.fillText("GOOD FOOD · GOOD MOOD",28,FY+17);
  ctx.textAlign="center"; ctx.fillText("🦉  🦉  🦉",CW/2,FY+17);
  ctx.textAlign="right"; ctx.fillText("THE CLOUD CAFÉ",CW-28,FY+17);

  return new Promise(resolve=>canvas.toBlob(b=>resolve(b),"image/png"));
}
