import { getJsonBody, methodNotAllowed } from "../lib/api-utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  const { pin } = getJsonBody(req);
  const expected = process.env.ADMIN_PIN;
  if (!expected) {
    return res.status(500).json({ ok: false, error: "ADMIN_PIN is not set in Vercel env vars." });
  }
  return res.status(200).json({ ok: pin === expected });
}
