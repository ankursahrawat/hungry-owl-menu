// Vercel's Node.js runtime parses JSON bodies onto req.body automatically
// for standard Content-Type: application/json requests, but we guard
// against it being a raw string (can happen with some client fetch setups).
export function getJsonBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body || "{}"); } catch { return {}; }
  }
  return req.body;
}

// Server-side PIN check. The PIN itself lives only in a Vercel env var,
// never in client-shipped code, so it can't be read from page source.
export function requireAdmin(req, res) {
  const body = getJsonBody(req);
  const expected = process.env.ADMIN_PIN;
  if (!expected) {
    res.status(500).json({ error: "Server is missing ADMIN_PIN env var — set it in Vercel project settings." });
    return null;
  }
  if (body.pin !== expected) {
    res.status(401).json({ error: "Wrong PIN" });
    return null;
  }
  return body;
}

export function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ error: "Method not allowed" });
}
