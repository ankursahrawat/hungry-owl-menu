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
const SHOP_PHONE = "919308006900"; // always shown
function renderContactBar(cfg){
  const bar = document.getElementById("contactBar");
  if(!bar) return;
  const phone = (cfg.phone || "").replace(/\D/g,"") || SHOP_PHONE;
  bar.innerHTML = `
    <a class="contact-btn contact-call" href="tel:+${phone}">📞 Call</a>
    <a class="contact-btn contact-wa" href="https://wa.me/${phone}" target="_blank" rel="noopener">
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
  if(!entries.length) return;

  const noteInput = document.getElementById("orderNote");
  if(!noteInput.value.trim()){
    hint.textContent = "⚠️ Please enter your name before sending the order.";
    noteInput.focus();
    noteInput.style.borderColor = "var(--red)";
    return;
  }
  noteInput.style.borderColor = "";

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Preparing order…";
  hint.textContent = "";

  try{
    btn.textContent = "Assigning order number…";
    const { orderNo } = await api.nextOrderNumber();
    const orderLabel = formatOrderNo(orderNo);

    btn.textContent = "Preparing order…";
    const blob = await generateOrderImageBlob(orderNo);
    const preview = document.getElementById("orderCanvasPreview");
    preview.src = URL.createObjectURL(blob);
    preview.style.display = "block";

    const note = noteInput.value.trim();
    const captionLines = entries.map(([id,qty]) => `${qty} × ${items[id].name}`);
    const caption = `Order ${orderLabel} — ${new Date().toLocaleString()}\nFrom the menu (${note}):\n${captionLines.join("\n")}\nTotal: ${money(cartTotal())}`;

    // 1) Try delivering to the shop's WhatsApp via our own server.
    btn.textContent = "Sending to WhatsApp…";
    try{
      const result = await api.sendWhatsApp(caption);
      if(result.ok){
        hint.textContent = `✅ Order ${orderLabel} sent to the shop via WhatsApp!`;
        cart = {};
        renderPublicMenu(); updateCartFab();
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }
      if(result.configured === false){
        // WhatsApp API not set up — fall through to share sheet
      } else {
        hint.textContent = "Couldn't reach WhatsApp API automatically. Trying another way…";
      }
    }catch(err){
      hint.textContent = "Couldn't reach WhatsApp API (" + err.message + "). Trying another way…";
    }

    // 2) Fall back to opening WhatsApp directly with pre-filled message.
    const phone = SHOP_PHONE;
    const waText = encodeURIComponent(caption);
    const waUrl = `https://wa.me/${phone}?text=${waText}`;
    if(window.open(waUrl, "_blank")){
      hint.textContent = `✅ Order ${orderLabel} — WhatsApp opened with your order! Send the message to complete.`;
      cart = {};
      renderPublicMenu(); updateCartFab();
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    // 3) Last resort: download the image.
    downloadBlob(blob, `order-${orderLabel.replace('#','')}.png`);
    hint.textContent = `Order ${orderLabel} image downloaded. Screenshot it and send via WhatsApp to complete your order.`;
    btn.textContent = originalText;
    btn.disabled = false;
  }catch(err){
    hint.textContent = "Something went wrong generating the order: " + err.message;
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

/* ---------------- INIT ---------------- */
(async () => {
  await loadBranding(); // load bestsellerIds first so menu renders with correct state
  await loadMenu();
})();
