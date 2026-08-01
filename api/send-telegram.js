import { getJsonBody, methodNotAllowed } from "../lib/api-utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    // Not an error — the client falls back to the share sheet / download
    // when Telegram isn't configured. This just reports that state.
    return res.status(200).json({ ok: false, configured: false });
  }

  const { imageBase64, caption } = getJsonBody(req);
  if (!imageBase64) {
    return res.status(400).json({ ok: false, error: "Missing image data" });
  }

  try {
    const base64Data = imageBase64.includes(",") ? imageBase64.split(",").pop() : imageBase64;
    const buffer = Buffer.from(base64Data, "base64");
    const blob = new Blob([buffer], { type: "image/png" });

    const fd = new FormData();
    fd.append("chat_id", chatId);
    fd.append("caption", (caption || "").slice(0, 1024));
    fd.append("photo", blob, "order.png");

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: fd,
    });
    const data = await tgRes.json();
    if (!data.ok) {
      return res.status(502).json({ ok: false, configured: true, error: data.description || "Telegram rejected the request" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, configured: true, error: err.message });
  }
}
