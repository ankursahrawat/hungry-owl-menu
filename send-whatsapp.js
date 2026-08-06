import { methodNotAllowed } from "../lib/api-utils.js";

// Sends an order to WhatsApp Business Cloud API (Meta).
// Uploads the order image first, then sends it as a photo message
// with the order text as the caption — so the shop receives both together.
//
// Required env vars (Vercel → Settings → Environment Variables):
//   WHATSAPP_TOKEN       — permanent access token from Meta Business Suite
//   WHATSAPP_PHONE_ID    — phone number ID from Meta WhatsApp API dashboard
//   WHATSAPP_TO          — shop owner WhatsApp number with country code, no + (e.g. 9193080069)

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to      = process.env.WHATSAPP_TO;

  if (!token || !phoneId || !to) {
    return res.status(200).json({ ok: false, configured: false });
  }

  // Body: { text: string, imageBase64: string (optional, PNG) }
  let body;
  try {
    const raw = await new Promise((resolve, reject) => {
      let data = "";
      req.on("data", chunk => { data += chunk; });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    body = JSON.parse(raw);
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const { text, imageBase64 } = body;
  if (!text) return res.status(400).json({ ok: false, error: "Missing text" });

  const BASE = `https://graph.facebook.com/v19.0`;
  const headers = { "Authorization": `Bearer ${token}` };

  try {
    // --- If image provided: upload it then send as image + caption ---
    if (imageBase64) {
      // 1) Convert base64 to binary buffer
      const imageBuffer = Buffer.from(
        imageBase64.replace(/^data:image\/\w+;base64,/, ""),
        "base64"
      );

      // 2) Upload media to WhatsApp
      const formData = new FormData();
      formData.append("messaging_product", "whatsapp");
      formData.append(
        "file",
        new Blob([imageBuffer], { type: "image/png" }),
        "order.png"
      );
      formData.append("type", "image/png");

      const uploadRes = await fetch(`${BASE}/${phoneId}/media`, {
        method: "POST",
        headers,
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadData.id) {
        // Upload failed — fall back to text-only
        return await sendTextOnly({ BASE, phoneId, to, headers, text, res });
      }

      const mediaId = uploadData.id;

      // 3) Send image message with caption
      const msgRes = await fetch(`${BASE}/${phoneId}/messages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "image",
          image: {
            id: mediaId,
            caption: text.slice(0, 1024),
          },
        }),
      });
      const msgData = await msgRes.json();
      if (msgData.messages) return res.status(200).json({ ok: true, method: "image" });
      // Image send failed — fall back to text
      return await sendTextOnly({ BASE, phoneId, to, headers, text, res });
    }

    // --- No image: send text only ---
    return await sendTextOnly({ BASE, phoneId, to, headers, text, res });

  } catch (err) {
    return res.status(500).json({ ok: false, configured: true, error: err.message });
  }
}

async function sendTextOnly({ BASE, phoneId, to, headers, text, res }) {
  const waRes = await fetch(`${BASE}/${phoneId}/messages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });
  const data = await waRes.json();
  if (data.messages) return res.status(200).json({ ok: true, method: "text" });
  return res.status(502).json({ ok: false, configured: true, error: data.error?.message || "WhatsApp API error" });
}
