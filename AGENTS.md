# Peakora Affiliate Engine — Session Notes

## Architecture (Cloudflare stack)
- Worker: `worker/src/index.js` (router) + `worker/src/affiliate.js` (engine) + `worker/src/dodo.js` (billing). Deployed via `wrangler deploy` or `.github/workflows/deploy-worker.yml`.
- D1 schema: `worker/schema.sql` (idempotent CREATE TABLE IF NOT EXISTS + backfill UPDATEs, runs on every deploy).
- Pages: static marketing + portal HTML (`affiliate.html`, `affiliate-portal.html`, `index.html`, `admin-affiliates.html`). Auto-deploys from git via Cloudflare Pages.
- Tests: `tests/affiliate.test.js` (29 tests, real code paths, no mocks). Run: `node --test tests/affiliate.test.js`.

## Affiliate program config (as of 2026-08-24)
- Commission: flat 50% recurring (price $9.99/mo, $95.88/yr).
- Payout min: $25, monthly schedule, 30-day hold window on each commission.
- Auto-approval: every applicant is `status='active'` instantly on apply + login safety net.
- Master admin: peakora.network@gmail.com.
- Payout methods: PayPal, Wise, bank, USDC (stored in `payout_details` JSON).
- DEFAULT_TIERS = [{ minReferrals:0, rate:0.50, name:'Partner', cookieDays:90, payoutMin:25, payoutSchedule:'monthly' }].
- ADMIN_TOKEN: (Cloudflare secret, set via `wrangler secret put`). The live deployed token is the source of truth; do NOT paste the stale `pk_admin_...` value from older notes. Admin panel at /admin-affiliates. The panel also accepts a signed-in admin partner (the master account) via Google/email sign-in, so the raw token is optional.
- DB: 2 real affiliates (both Ala), all test accounts cleaned out.

## Key implementation notes
- `calculateCommission` uses the stored `commission_rate` column, NOT `tier_config`. The dashboard overrides `tier.rate` with the stored rate for percentage affiliates so the portal never shows a number that disagrees with the commission amounts.
- `decorateAffiliate`: tier_config falls back to DEFAULT_TIERS when null; payout_min is read from the column (backfilled to 25).
- Self-referral blocking: customer email/IP hashed and matched against affiliate's own record.
- Webhook: `/dodo/webhook`, Standard Webhooks HMAC verified (webhook-id, webhook-timestamp, webhook-signature). Unsigned requests rejected with "Invalid signature".
- Schema backfills (idempotent, run every deploy): commission_rate->0.50, payout_min->25, pending->active.
- Partner auth is email + password (PBKDF2-SHA256, 100k iter, random salt stored as `password_hash` = `pbkdf2$iter$saltB64$hashB64`). `handleAffiliateLogin` verifies the password; the HMAC portal token (7d) is still issued after login. Legacy accounts with NULL `password_hash` are forced through a one-time `/affiliate/set-password` flow (closes the old email-only access hole). Admin can also set a partner password via `/affiliate/admin/set-password`. Apply now requires a password and optionally collects payout method + details at signup.
- Apply is one-per-email: re-applying with an existing email returns `already_partner=true` + the stored referral code + a sign-in CTA (never a new/different code).
- Dashboard returns `available_balance` (approved, post-hold) in addition to pending/paid; the portal shows a balance hero card, a 6-month SVG earnings bar chart, and a clicks->conversions->active funnel (no chart libs, pure inline SVG/CSS).
- Admin panel uses ADMIN_TOKEN (Cloudflare secret), NOT email. The live token works (verified). Add `password_hash` column via schema.sql on next deploy (CREATE TABLE IF NOT EXISTS does not alter existing tables; the column add is handled by the schema run for fresh DBs - for the existing DB run the ALTER in schema.sql).

## Deploy gotcha
- GitHub Actions Worker deploy sometimes fails in ~4s with `steps:[]` / `runner_id:0` (infra allocation, not code). Fallback: `cd worker && CLOUDFLARE_API_TOKEN=$TOKEN npx wrangler deploy && npx wrangler d1 execute peakora-db --remote --file=schema.sql`. Pages deploys independently from git.
- Local npm: root `package.json` lists `wrangler ^4.125.0` as devDep. Run `npm install` at repo root first (creates local `node_modules/.bin/wrangler`), then `cd worker && CLOUDFLARE_API_TOKEN=$TOKEN npx wrangler deploy`. Global `npm i -g wrangler` fails on permissions in this env.
- Cloudflare Pages auto-deploys from git on push to main. The worker does NOT auto-deploy from Pages; it deploys via GitHub Actions (`.github/workflows/deploy-worker.yml`) on push to `worker/**`, or manually via wrangler. So: frontend changes need a git push to go live; worker changes need a git push (CI) or manual `wrangler deploy`.
- **Push to deploy**: local commits do NOT appear on the live site until pushed to `origin/main`. Verified 2026-08-26: live Pages had SW `v11-mobile-drawer` + old affiliate copy while local was at `v13` + new copy, because 6 local commits were unpushed.
- The `affiliates.password_hash` column is new. CREATE TABLE IF NOT EXISTS will not add it to the existing table, so run a one-time `ALTER TABLE affiliates ADD COLUMN password_hash TEXT;` if the column is missing (D1 ignores the error if it already exists). Both existing real affiliates (peakora.network@gmail.com = BGJQFP, ibieruti@gmail.com = 3NZ2R8) have NULL password_hash and must set one via the portal set-password flow or admin set-password before they can log in.

## Web push (notifications)
- `push_subscriptions` table: `endpoint` (PRIMARY KEY, the per-device FCM/Mozilla push URL), `keys` (JSON with p256dh + auth), `created_at`. No user identity linked - subscriptions are anonymous per-browser.
- Endpoints: `/push-subscribe` (store), `/push-unsubscribe` (remove), `/push-key` (VAPID public key), `/push-broadcast` (admin: send to ALL devices), `/push-subscriptions` (admin: list devices), `/push-send` (admin: send to ONE endpoint = targeted per-machine).
- Targeted per-user push is NOT possible without a login/account system on the PWA, because subscriptions aren't linked to identity. The push `endpoint` URL is the only per-machine identifier. To target Ala specifically, use `/push-subscriptions` to find the device endpoint, then `/push-send`.
- VAPID keys are Cloudflare secrets (VAPID_PUBLIC_KEY returned by /push-key, VAPID_PRIVATE_KEY used to sign JWTs). Daily nudge cron: `0 9 * * *` UTC.

## Style rules (mandatory)
- NO labels/eyebrows/badges (no hero-eyebrow, aff-hero-badge, diff-eyebrow).
- NO em-dashes - use plain hyphens or restructure.
- No emoji anywhere.
- Insights charts: pure inline SVG (no chart libs). The Mood Pattern card is a "mood river" SVG (quadratic trend path + gradient area + glow dots). Do NOT reintroduce absolute-positioned bubble divs positioned from clientWidth/clientHeight - they collapse to a stacked pile when rendered before the container has a measured width (the original stacking-on-start bug).

## Workflow rules (mandatory)
- Big prompts: when a partner request bundles many distinct tasks, divide it into manageable chunks (PROMPT A, PROMPT B, ...) and confirm the split before executing. Do not try to do everything in one pass; finish and verify one chunk before starting the next.
- CRITICAL INSTRUCTION: Do not output raw parameter tags, DSML tags, or XML tool closing tags in text. Execute tool actions cleanly without echoing parser parameters.
 Commit every task when you finish it (and push., so the partner never has to chase the build. Do not start fucking around - one chunk at a time, verify, commit, push, then next.

---

# Peakora Dark Luxury Wellness — Master Style System & Guidelines

This document details the complete **Dark Luxury Wellness** visual design system, CSS variables, utility classes, and dynamic theme architecture. Use this specification as the master style setup for all applet components and pop-up modals.

---

## 1. Master Style Philosophy & Design System

- **Aesthetic**: Deep Midnight / Obsidian Canvas with Warm Terracotta, Honey Amber, and Amethyst Glow Accents.
- **Glassmorphism**: Soft background blurs (`backdrop-filter: blur(12px)`), layered translucent cards, and high-contrast light text against deep dark backgrounds.
- **Typography**:
  - Headings & Brand: `'Plus Jakarta Sans'`, sans-serif, bold/extra-bold, generous tracking.
  - Body Text: `'Inter'`, system-ui, sans-serif, high legibility (`--theme-text-main: #f8fafc`, `--theme-text-muted: #a0aec0`).
- **Responsive Layout**: Fluid CSS Grid architecture that automatically scales from small mobile screens (320px) to ultra-wide desktop displays without clipping, horizontal scrollbars, or overlapping elements.

---

## 2. Core CSS Variables & Color Tokens

Add these root CSS custom properties to ensure full theme compatibility across all components:

```css
:root {
  /* Default Theme: Sunrise (Warm Amber / Terracotta) */
  --theme-bg: #0c0a15;
  --theme-card-bg: #151122;
  --theme-card-border: rgba(255, 255, 255, 0.08);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #a0aec0;
  --theme-heading: #ffffff;
  --theme-accent: #f4a261;
  --theme-accent-glow: rgba(224, 122, 95, 0.35);
  --theme-primary-grad: linear-gradient(135deg, #e07a5f 0%, #f4a261 50%, #a78bfa 100%);
  --theme-card-glow: rgba(224, 122, 95, 0.18);
  --theme-card-glow-hover: rgba(224, 122, 95, 0.38);
}

/* Dynamic Mood & Color Space Palettes */
body[data-theme="sunrise"], [data-theme="sunrise"] {
  --theme-bg: #0c0a15;
  --theme-card-bg: #151122;
  --theme-card-border: rgba(224, 122, 95, 0.25);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #a0aec0;
  --theme-heading: #ffffff;
  --theme-accent: #f4a261;
  --theme-accent-glow: rgba(224, 122, 95, 0.35);
  --theme-primary-grad: linear-gradient(135deg, #e07a5f, #f4a261, #a78bfa);
  --theme-card-glow: rgba(224, 122, 95, 0.2);
  --theme-card-glow-hover: rgba(224, 122, 95, 0.4);
}

body[data-theme="sage"], [data-theme="sage"] {
  --theme-bg: #08140e;
  --theme-card-bg: #112218;
  --theme-card-border: rgba(52, 211, 153, 0.25);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #a7f3d0;
  --theme-heading: #ffffff;
  --theme-accent: #34d399;
  --theme-accent-glow: rgba(52, 211, 153, 0.35);
  --theme-primary-grad: linear-gradient(135deg, #34d399, #10b981, #f59e0b);
  --theme-card-glow: rgba(52, 211, 153, 0.2);
  --theme-card-glow-hover: rgba(52, 211, 153, 0.4);
}

body[data-theme="amethyst"], [data-theme="amethyst"] {
  --theme-bg: #140d21;
  --theme-card-bg: #1d1230;
  --theme-card-border: rgba(192, 132, 252, 0.25);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #e9d5ff;
  --theme-heading: #ffffff;
  --theme-accent: #c084fc;
  --theme-accent-glow: rgba(192, 132, 252, 0.35);
  --theme-primary-grad: linear-gradient(135deg, #c084fc, #a855f7, #ec4899);
  --theme-card-glow: rgba(192, 132, 252, 0.2);
  --theme-card-glow-hover: rgba(192, 132, 252, 0.4);
}

body[data-theme="twilight"], [data-theme="twilight"] {
  --theme-bg: #0b0f24;
  --theme-card-bg: #121835;
  --theme-card-border: rgba(129, 140, 248, 0.25);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #c7d2fe;
  --theme-heading: #ffffff;
  --theme-accent: #818cf8;
  --theme-accent-glow: rgba(129, 140, 248, 0.35);
  --theme-primary-grad: linear-gradient(135deg, #818cf8, #4f46e5, #38bdf8);
  --theme-card-glow: rgba(129, 140, 248, 0.2);
  --theme-card-glow-hover: rgba(129, 140, 248, 0.4);
}

body[data-theme="solar"], [data-theme="solar"] {
  --theme-bg: #1a1506;
  --theme-card-bg: #282008;
  --theme-card-border: rgba(250, 204, 21, 0.3);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #fef08a;
  --theme-heading: #ffffff;
  --theme-accent: #facc15;
  --theme-accent-glow: rgba(250, 204, 21, 0.4);
  --theme-primary-grad: linear-gradient(135deg, #facc15, #eab308, #f97316);
  --theme-card-glow: rgba(250, 204, 21, 0.22);
  --theme-card-glow-hover: rgba(250, 204, 21, 0.45);
}

body[data-theme="sunset"], [data-theme="sunset"] {
  --theme-bg: #180a14;
  --theme-card-bg: #261121;
  --theme-card-border: rgba(251, 113, 133, 0.25);
  --theme-text-main: #f8fafc;
  --theme-text-muted: #fecdd3;
  --theme-heading: #ffffff;
  --theme-accent: #fb7185;
  --theme-accent-glow: rgba(251, 113, 133, 0.35);
  --theme-primary-grad: linear-gradient(135deg, #f43f5e, #fb7185, #f4a261);
  --theme-card-glow: rgba(251, 113, 133, 0.2);
  --theme-card-glow-hover: rgba(251, 113, 133, 0.4);
}
```

---

## 3. Standardized Pop-Up Modal Component Class (`.peakora-modal-standard`)

All pop-up windows in the application use a unified overlay container and `.peakora-modal-standard` card class to ensure consistent 24px corner radius, backdrop-filter blur, ambient card glow, padding, close buttons, and dynamic theme inheritance:

```css
/* Backdrop Overlay */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(8, 6, 14, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  animation: modalFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Standardized Pop-up Card */
.modal-card, .peakora-popup-card, .peakora-modal-standard {
  background: var(--theme-card-bg) !important;
  color: var(--theme-text-main) !important;
  border-radius: 24px !important;
  max-width: 540px;
  width: 100%;
  max-height: 88vh;
  overflow-y: auto;
  padding: 32px 28px !important;
  box-shadow: 0 28px 70px rgba(0, 0, 0, 0.9), 0 0 40px var(--theme-card-glow) !important;
  border: 1px solid var(--theme-card-border) !important;
  position: relative;
  transition: all 0.35s ease;
  text-align: center;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.peakora-modal-standard h1,
.peakora-modal-standard h2,
.peakora-modal-standard h3,
.peakora-modal-standard h4 {
  color: var(--theme-heading, #ffffff) !important;
}

/* Modal Close Button */
.modal-close, .modal-close-btn, .peakora-popup-close {
  position: absolute;
  top: 18px;
  right: 20px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  transition: all 0.25s ease;
  z-index: 10;
}

.modal-close:hover, .modal-close-btn:hover, .peakora-popup-close:hover {
  background: var(--theme-primary-grad);
  color: #ffffff !important;
  border-color: transparent;
  transform: scale(1.1) rotate(90deg);
  box-shadow: 0 4px 16px var(--theme-accent-glow);
}
```

### Dynamic Theme Propagation for Modals (JavaScript)

Whenever a pop-up modal is opened, pass the active theme key to the modal overlay element:

```javascript
function openAnyModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    const currentTheme = localStorage.getItem("peakora_theme") || "sunrise";
    modal.setAttribute("data-theme", currentTheme);
    modal.style.display = "flex";
  }
}
```

---

## 4. Responsive CSS Grid Layout Rules

The dashboard layout utilizes auto-fitting flex-grid columns to guarantee cards adapt fluidly from 320px mobile screens up to 4K displays:

```css
.dash-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 24px;
  margin-bottom: 24px;
  width: 100%;
}

.dash-grid-equal {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 24px;
  margin-bottom: 24px;
  width: 100%;
}

.dash-card {
  background: var(--theme-card-bg);
  border: 1px solid var(--theme-card-border);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  position: relative;
  transition: all 0.3s ease;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  overflow-wrap: break-word;
}
```

---

## 5. Master Style Setup Prompt (Save for AI Studio)

Copy and save the exact prompt below when generating new components or entire applets to automatically enforce this master visual design setup:

> **Master Style Prompt**:
> "Always apply the Peakora 'Dark Luxury Wellness' master design system. Build all cards and components using dark glassmorphism backgrounds (`background: var(--theme-card-bg); border: 1px solid var(--theme-card-border); border-radius: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.35); padding: 24px;`), high-contrast light typography, and ambient theme accent glows (`var(--theme-accent)`). Build all responsive layouts using CSS Grid (`grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr))`). Use `.peakora-modal-standard` for all pop-ups with `backdrop-filter: blur(12px)` overlay backdrops, and dynamically bind theme attributes via `data-theme`."

---

## Cross-Repo Memory Protocol (MANDATORY — from the peakora/peakora-cortex hub)

This repo consumes the central skills hub: **github.com/peakora/peakora-cortex**
(branch: master). The hub holds the master system blueprint, the shared skills,
and the cross-repo memory layers. User preference: call the owner **Ala** (never "user" or "users"). We are partners. No emoji anywhere (chat, code, copy, commits).

### Session start — recall (NEVER SKIP)
1. Fetch and read `MEMORY.md` from the hub (guaranteed layer, plain text).
   The hub is PRIVATE, so `raw.githubusercontent` 404s. Fetch via the GitHub
   Contents API (authenticated):
   `GET https://api.github.com/repos/peakora/Peakora-Cortex/contents/MEMORY.md`
   with `Authorization: Bearer $GITHUB_TOKEN`, then base64-decode the
   `content` field. (Fallback: shallow-clone the repo.)
2. Read this repo's `AGENTS.md` in full.
3. Best-effort Cognee recall (semantic layer, may be empty on the free tier):
   use `skills/cognee-memory/cognee_client.py` from the hub —
   `recall_safe("cross-repo architecture constraints, tech stack, coding preferences")`.

### Session end — remember (NEVER SKIP, before finishing)
1. GUARANTEED: append a dated entry to the Session Log in the hub's `MEMORY.md`
   (commit to peakora/peakora-cortex master, via git or GitHub API)
   summarizing decisions, API/schema changes, and gotchas for this repo.
2. Best-effort: `cognee_client.remember_safe(summary)` — add-only. NEVER call
   cognify automatically (burns the 20/day Gemini free quota; cognify is a
   manual, deliberate run).
3. Memory sync never blocks task completion — the MEMORY.md write is the
   fallback that always works.

### Cognee access (cloud agent — no local .env needed)
- URL auto-discovered from `tunnel_url.txt` in the hub repo.
- Auth: registered secret `COGNEE_API_KEY` sent as `X-Api-Key` header
  (fallback: `COGNEE_AUTH_EMAIL` / `COGNEE_AUTH_PASSWORD` Bearer login).
- Dataset: `global_user_memory`.
