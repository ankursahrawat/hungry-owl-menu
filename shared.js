/* ---------------- SHARED HELPERS ---------------- */

function money(n){ return "₹" + Number(n).toString(); }

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(msg){
  const t = document.getElementById("toast");
  if(!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>t.classList.remove("show"), 2200);
}

/* Small fetch wrapper: throws with the server's error message on failure,
   so callers can show something useful instead of a generic network error. */
async function apiFetch(url, options){
  const res = await fetch(url, options);
  let data = null;
  try{ data = await res.json(); }catch(e){ /* no body */ }
  if(!res.ok){
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data;
}

const api = {
  getMenu: () => apiFetch("/api/menu"),
  saveMenu: (pin, menu) => apiFetch("/api/menu", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, menu })
  }),
  getSiteConfig: () => apiFetch("/api/site-config"),
  saveSiteConfig: (pin, cfg) => apiFetch("/api/site-config", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, ...cfg })
  }),
  nextOrderNumber: () => apiFetch("/api/order-number", { method: "POST" }),
  resetOrderCounter: (pin) => apiFetch("/api/order-number", {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin })
  }),
  sendWhatsApp: (text, imageBase64) => apiFetch("/api/send-whatsapp", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, imageBase64: imageBase64 || null })
  }),
  getStatus: () => apiFetch("/api/status"),
  // OMS (Order Management System) — Batch 1: background order recording only.
  createOrder: (payload) => apiFetch("/api/orders", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }),
  getOrders: (pin, orderNo) => apiFetch(
    `/api/admin/orders?pin=${encodeURIComponent(pin)}${orderNo ? `&orderNo=${encodeURIComponent(orderNo)}` : ""}`
  ),
  updateOrder: (pin, orderNo, patch) => apiFetch("/api/admin/orders", {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, orderNo, ...patch })
  }),
  getAnalytics: (pin, range, from, to) => {
    let url = `/api/admin/analytics?pin=${encodeURIComponent(pin)}&range=${encodeURIComponent(range)}`;
    if(range === "custom"){
      url += `&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    }
    return apiFetch(url);
  },
};

function applySiteConfig(cfg){
  const nameEl = document.getElementById("brandName");
  const tagEl = document.getElementById("brandTagline");
  if(nameEl) nameEl.textContent = cfg.brandName || "Hungry Owl";
  if(tagEl) tagEl.textContent = cfg.tagline || "";
  document.title = (cfg.brandName || "Hungry Owl") + " — Menu";

  const logoArea = document.getElementById("logoArea");
  if(logoArea){
    if(cfg.logoImage){
      logoArea.innerHTML = `<img class="logo-image" src="${cfg.logoImage}" alt="Logo">`;
    } else if(cfg.logoEmoji && cfg.logoEmoji.trim()){
      logoArea.innerHTML = `<div class="logo-emoji">${escapeHtml(cfg.logoEmoji.trim())}</div>`;
    } else {
      logoArea.innerHTML = `<img class="owl" src="/hungry-owl-logo.svg" alt="Hungry Owl">`;
    }
  }

  const bannerWrap = document.getElementById("announcementBanner");
  const bannerText = document.getElementById("announcementText");
  if(bannerWrap && bannerText){
    const msg = (cfg.announcement || "").trim();
    if(msg){
      bannerText.textContent = msg;
      bannerWrap.style.display = "flex";
    } else {
      bannerWrap.style.display = "none";
    }
  }

  const phoneLink = document.getElementById("brandPhone");
  const phoneNum = document.getElementById("brandPhoneNum");
  if(phoneLink && phoneNum){
    if(cfg.phone && cfg.phone.trim()){
      phoneNum.textContent = cfg.phone.trim();
      phoneLink.href = "tel:" + cfg.phone.trim().replace(/[^\d+]/g,"");
      phoneLink.style.display = "inline-flex";
    } else {
      phoneLink.style.display = "none";
    }
  }
}

/* ---------------- CANVAS TEXT HELPERS (used by order + full-menu image export) ---------------- */
function fitText(ctx, text, maxWidth){
  if(ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while(s.length > 1 && ctx.measureText(s + "…").width > maxWidth){
    s = s.slice(0, -1);
  }
  return s + "…";
}
function wrapText(ctx, text, maxWidth, maxLines){
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for(const word of words){
    const test = line ? line + " " + word : word;
    if(ctx.measureText(test).width > maxWidth && line){
      lines.push(line);
      line = word;
      if(maxLines && lines.length === maxLines - 1){
        const rest = words.slice(words.indexOf(word)).join(" ");
        lines.push(fitText(ctx, rest, maxWidth));
        return lines;
      }
    } else {
      line = test;
    }
  }
  if(line) lines.push(line);
  return lines;
}
function loadImageEl(src){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function drawRoundedRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}
function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function downloadBlob(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
