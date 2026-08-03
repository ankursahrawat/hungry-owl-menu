import { getJsonBody, methodNotAllowed } from "../lib/api-utils.js";

// Sends an order to WhatsApp Business Cloud API (Meta).
// Required env vars (set in Vercel → Settings → Environment Variables):
//   WHATSAPP_TOKEN       — permanent access token from Meta Business Suite
//   WHATSAPP_PHONE_ID    — phone number ID from Meta WhatsApp API dashboard
//   WHATSAPP_TO          — the shop owner's WhatsApp number (e.g. 919308006900)
//
// The message payload is a plain-text order summary; no image upload needed
// for the basic integration (keeping it simple and reliable).

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const token   = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const to      = process.env.WHATSAPP_TO;

  if (!token || !phoneId || !to) {
    return res.status(200).json({ ok: false, configured: false });
  }

  const { text } = getJsonBody(req);
  if (!text) return res.status(400).json({ ok: false, error: "Missing text" });

  try {
    const waRes = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text.slice(0, 4096) },
        }),
      }
    );
    const data = await waRes.json();
    if (data.messages) return res.status(200).json({ ok: true });
    return res.status(502).json({ ok: false, configured: true, error: data.error?.message || "WhatsApp rejected the request" });
  } catch (err) {
    return res.status(500).json({ ok: false, configured: true, error: err.message });
  }
}
