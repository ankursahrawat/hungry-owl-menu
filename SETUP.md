# Hungry Owl Menu — Vercel Setup

This replaces the old single-file version. It's now a real small app with two
separate pages and a real database, instead of relying on Claude.ai's
artifact-only storage (which is why nothing was saving before).

## What changed

- **`/` (index.html)** — customer page. Menu + ordering only. No admin
  code is even shipped here, so there's nothing to hide or bypass.
- **`/admin.html`** — staff page. PIN-gated menu/branding editor, QR code,
  Telegram status. This is the link *you* bookmark, not the one you print.
- **`/api/*`** — serverless functions that read/write a real database
  (Upstash Redis) and talk to Telegram. Your bot token now lives only in
  a Vercel environment variable — it's never sent to any browser.
- Order numbers use Redis' atomic `INCR`, so they genuinely can't collide
  or reset, even with two customers ordering at the same instant.
- The customer page polls the menu/branding every ~15 seconds (and on
  tab focus), so edits you make in `/admin.html` show up for customers
  without them needing to refresh manually.

## 1. Create the database (one-time, ~2 minutes)

1. In your Vercel project dashboard, go to **Storage → Create Database**.
2. Choose **Upstash** → **Redis** (free tier is plenty for this).
3. Once created, Vercel automatically adds `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`,
   depending on which flow Vercel shows you — the code checks both) to
   your project's environment variables. Nothing else to do here.

If that path isn't available for you, create a free database directly at
[upstash.com](https://upstash.com), then in Vercel go to **Settings →
Environment Variables** and add `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` yourself (values are on the Upstash database
page, under "REST API").

## 2. Set your admin PIN

**Settings → Environment Variables** in Vercel:

| Name | Value |
|---|---|
| `ADMIN_PIN` | any PIN you want, e.g. `2847` |

This replaces the old hardcoded PIN in the file — it's no longer visible
in the page source at all.

## 3. (Optional) Connect Telegram

If you want orders delivered straight to your Telegram automatically:

1. Message **@BotFather** on Telegram → `/newbot` → follow the prompts →
   copy the token it gives you.
2. Message **@userinfobot** (or add your bot to a group and check its
   info) to get your numeric Chat ID.
3. In Vercel, add:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_CHAT_ID` | your chat ID |

If you skip this, "Send Order" still works — it falls back to your
customers' phone share sheet, then to a plain download, in that order.

## 4. Deploy

After setting the environment variables, **redeploy** (env var changes
don't apply to a deployment already running — Vercel will prompt you, or
just push any small change / hit "Redeploy" in the dashboard).

## 5. Everyday use

- Bookmark `https://your-app.vercel.app/admin.html` for managing the menu.
- Open `/admin.html` → the QR code shown there always points at `/`
  (the customer page) — print that QR code for tables.
- Changing your Vercel deployment URL or custom domain doesn't require
  any code changes — the QR code and API calls are all relative.

## Notes on the PIN

The PIN is checked **server-side** now (via `ADMIN_PIN`), so it isn't
readable from page source the way it was before. It's still a simple
shared PIN rather than individual staff logins — fine for a small counter
operation, but don't treat it as bank-grade security.
