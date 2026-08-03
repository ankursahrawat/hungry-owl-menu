/* ---------------- STATE ---------------- */
let menu = { sections: [] };
let cart = {};
let sectionObserver = null;

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
    applySiteConfig(cfg);
  }catch(e){ /* keep defaults already in the HTML if this fails */ }
}

// Customers don't get push updates from the admin panel, so we poll
// periodically and whenever the tab regains focus — close enough to
// real-time for a small menu without needing WebSockets/infra.
const POLL_MS = 15000;
setInterval(() => { loadMenu(); loadBranding(); }, POLL_MS);
document.addEventListener("visibilitychange", () => { if(!document.hidden){ loadMenu(); loadBranding(); } });
window.addEventListener("focus", () => { loadMenu(); loadBranding(); });

/* ---------------- PUBLIC MENU RENDER ---------------- */
function renderPublicMenu(){
  const area = document.getElementById("menuArea");
  if(!menu.sections.length){
    area.innerHTML = `<div class="empty-note">The menu is empty right now — check back soon.</div>`;
    renderCatRail();
    return;
  }
  // Preserve scroll position across re-renders triggered by polling.
  area.innerHTML = menu.sections.map(sec => `
    <div class="section" id="section-${sec.id}">
      <div class="section-title-row">
        <div class="rule"></div><div class="pill">${escapeHtml(sec.name)}</div><div class="rule"></div>
      </div>
      ${ sec.items.length
          ? sec.items.map(it => {
              const qty = cart[it.id] || 0;
              const control = qty > 0
                ? `<div class="item-qty-stepper">
                     <button data-cart-act="dec" data-iid="${it.id}">−</button>
                     <span class="qty-num">${qty}</span>
                     <button data-cart-act="inc" data-iid="${it.id}">+</button>
                   </div>`
                : `<button class="item-add-btn" data-cart-act="inc" data-iid="${it.id}">Add <span>+</span></button>`;
              return `
            <div class="item-row">
              <span class="item-name">${escapeHtml(it.name)}</span>
              <span class="dots"></span>
              <span class="item-price">${money(it.price)}</span>
              ${control}
            </div>`;
            }).join("")
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
  const prevActive = rail.querySelector(".cat-rail-btn.active")?.dataset.target;
  rail.innerHTML = menu.sections.map((sec, i) => {
    const target = `section-${sec.id}`;
    const active = prevActive ? target === prevActive : i === 0;
    return `<button class="cat-rail-btn${active?' active':''}" data-target="${target}">
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
function allItemsFlat(){
  const map = {};
  menu.sections.forEach(sec => sec.items.forEach(it => { map[it.id] = { ...it, section: sec.name }; }));
  return map;
}
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

    // 1) Try delivering straight to the shop's Telegram via our own
    //    server (the bot token lives in a Vercel env var, never here).
    btn.textContent = "Sending to Telegram…";
    try{
      const imageBase64 = await blobToBase64(blob);
      const result = await api.sendTelegram(imageBase64, caption);
      if(result.ok){
        hint.textContent = `✅ Order ${orderLabel} sent! The shop has received it on Telegram.`;
        cart = {};
        renderPublicMenu(); updateCartFab();
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }
      if(result.configured === false){
        // Telegram just isn't set up — not an error, fall through quietly.
      } else {
        hint.textContent = "Couldn't reach Telegram automatically. Trying another way to send it…";
      }
    }catch(err){
      hint.textContent = "Couldn't reach Telegram automatically (" + err.message + "). Trying another way to send it…";
    }

    // 2) Fall back to the phone's native share sheet.
    const file = new File([blob], `order-${orderLabel.replace('#','')}.png`, { type: "image/png" });
    if(navigator.canShare && navigator.canShare({ files: [file] })){
      btn.textContent = "Opening share sheet…";
      try{
        await navigator.share({ files: [file], title: `Order ${orderLabel}`, text: caption });
        hint.textContent = `✅ Order ${orderLabel} shared — send it to the shop's Telegram to complete your order.`;
        cart = {};
        renderPublicMenu(); updateCartFab();
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }catch(err){
        if(err.name === "AbortError"){
          hint.textContent = "Share cancelled — your order is still saved here, tap Send Order when ready.";
          btn.textContent = originalText;
          btn.disabled = false;
          return;
        }
        // any other share error: fall through to download
      }
    } else {
      hint.textContent = (hint.textContent ? hint.textContent + " " : "") +
        "Direct sharing isn't available in this browser, so we're downloading the order image instead.";
    }

    // 3) Last resort: download the image.
    downloadBlob(blob, `order-${orderLabel.replace('#','')}.png`);
    hint.textContent = `Order ${orderLabel} image downloaded. Open Telegram and send this image to the shop to complete your order.`;
    btn.textContent = originalText;
    btn.disabled = false;
  }catch(err){
    hint.textContent = "Something went wrong generating the order: " + err.message;
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

/* ---------------- INIT ---------------- */
loadMenu();
loadBranding();
