// Copyright (c) 2026 Peakora. All rights reserved. Licensed under the MIT License; see NOTICE and LICENSE.
import { sendWebPush } from './webpush.js';
import { sendWelcomeImmediate, runSequenceTick, previewEmail, sendTestEmail } from './emaillist.js';
/**
 * Peakora shared API backend — Cloudflare Worker.
 *
 * Routes:
 *   GET  /dodo/config              — public payment config (link URLs, prices)
 *   POST /dodo/webhook             — receives Dodo payment events (HMAC-verified)
 *   GET  /subscription-status       — check subscription by email
 *   POST /subscribe                — email newsletter capture
 *   POST /feedback                 — user feedback
 *   POST /event                   — usage telemetry
 *   GET  /stats                    — admin dashboard stats (admin token)
 *   GET  /admin/emails             — unified email insights dashboard data (admin)
 *   GET  /admin/emails/export.csv  — export the full email list as CSV (admin)
 *   GET  /admin/email/preview      — preview a sequence email as HTML (admin)
 *   POST /admin/email/test         — send a test sequence email (admin)
 *   POST /push-subscribe           — web push subscription
 *   POST /push-unsubscribe         — remove web push subscription
 *   GET  /push-key                 — VAPID public key (for the browser subscribe() call)
 *   POST /push-broadcast           — admin push broadcast (admin token)
 *   GET  /push-subscriptions       — list subscribed devices (admin token)
 *   POST /push-send                — send push to one device endpoint (admin token)
 *
 * Affiliate program (see affiliate.js):
 *   GET  /affiliate/click          — record a referral click (returns 1x1 GIF)
 *   POST /affiliate/apply          — partner application
 *   POST /affiliate/login          — partner portal login (email + password -> signed token)
 *   POST /affiliate/set-password   — set/change password (legacy one-time or authenticated)
 *   GET  /affiliate/dashboard      — partner portal aggregate (token auth)
 *   POST /affiliate/link           — generate a tracked referral link (token auth)
 *   POST /affiliate/payout-setup   — set payout method/details (token auth)
 *   POST /affiliate/request-payout — request a payout of approved balance (token auth)
 *   GET  /affiliate/google/start     — redirect to Google OAuth consent
 *   GET  /affiliate/google/callback  — Google OAuth callback (find-or-create, issue token)
 *   GET  /affiliate/admin/verify          — confirm a signed-in partner is admin
 *   GET  /affiliate/admin/list           — list affiliates (admin token or signed-in admin)
 *   POST /affiliate/admin/approve        — approve a partner (admin)
 *   POST /affiliate/admin/reject         — suspend/reject a partner (admin)
 *   POST /affiliate/admin/delete         — permanently delete a partner (admin)
 *   POST /affiliate/admin/adjust-commission — set custom rate (admin)
 *   POST /affiliate/admin/set-password  — set/reset a partner password (admin)
 *   GET  /affiliate/admin/ledger         — commission ledger (admin)
 *   POST /affiliate/admin/fulfill-payout — mark a payout sent (admin)
 *   GET  /affiliate/admin/export.csv     — export commission ledger CSV (admin)
 *
 * D1 binding: env.DB
 * KV binding:  env.AUTH (future: session tokens)
 */

// ── Dodo webhook verification (Standard Webhooks, Web Crypto API) ──────────

import {
  handleAffiliateClick, handleAffiliateApply, handleAffiliateLogin,
  handleAffiliateSetPassword, handleAffiliateDashboard, handleAffiliateLink,
  handleAffiliatePayoutSetup, handleAffiliateRequestPayout,
  handleAffiliateGoogleStart, handleAffiliateGoogleCallback,
  handleAdminListAffiliates, handleAdminApproveAffiliate, handleAdminRejectAffiliate,
  handleAdminDeleteAffiliate, handleAdminVerifyPartner, verifyAdminPartner,
  handleAdminAdjustCommission, handleAdminSetAffiliatePassword,
  handleAdminCommissionLedger, handleAdminFulfillPayout,
  handleAdminExportCsv, processAffiliateAttribution
} from './affiliate.js';

async function verifyDodoWebhook(rawBody, headers, secret) {
  if (!secret) return false;
  const msgId = headers.get('webhook-id') || '';
  const msgTs = headers.get('webhook-timestamp') || '';
  const sigHeader = headers.get('webhook-signature') || '';
  if (!msgId || !msgTs || !sigHeader) return false;

  const tsNum = Number(msgTs);
  if (!Number.isFinite(tsNum)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - tsNum);
  if (ageSec > 300) return false;

  const signed = `${msgId}.${msgTs}.${rawBody}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signed));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  for (const part of sigHeader.split(' ')) {
    const sig = part.startsWith('v1,') ? part.slice(3) : part;
    if (sig.length === expected.length && timingSafeCompare(sig, expected)) return true;
  }
  return false;
}

function timingSafeCompare(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireAdmin(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
  return timingSafeCompare(token, env.ADMIN_TOKEN);
}

/** Admin gate that ALSO accepts a signed-in admin partner (master account)
 *  presenting their portal token. This lets Ala unlock the panel by signing in
 *  with Google/email instead of pasting the raw ADMIN_TOKEN. */
async function requireAdminOrPartner(request, env) {
  if (requireAdmin(request, env)) return true;
  const aff = await verifyAdminPartner(request, env);
  return !!aff;
}

// ── Dodo event mapping ────────────────────────────────────────────────────

/** Resolve the gross amount paid in a Dodo event (across event shapes). */
function resolveGrossAmount(data, sub) {
  const candidates = [
    data.amount, data.amount_paid, data.total, data.price,
    sub.amount, sub.amount_paid, sub.total,
    data.payment && data.payment.amount, data.invoice && data.invoice.amount_paid,
    data.amount_total, data.value
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Fall back to known plan prices (env-agnostic) so attribution still accrues.
  return null;
}

function mapDodoEvent(payload, env) {
  const type = payload.type || payload.event_type || '';
  const data = payload.data || payload;
  const sub = data.subscription || data;
  const customer = data.customer || {};
  // Dodo echoes the checkout metadata back verbatim. The affiliate referral
  // code set at checkout (metadata.via) is the authoritative attribution signal
  // for "which affiliate referred THIS customer".
  const metadata = data.metadata || sub.metadata || payload.metadata || {};

  const email = (customer.email || data.email || sub.email || '').toLowerCase() || null;
  const productId = sub.product_id || data.product_id || null;
  const yearlyId = env.DODO_YEARLY_PRODUCT_ID;
  const monthlyId = env.DODO_MONTHLY_PRODUCT_ID;
  const tripwireId = env.DODO_TRIPWIRE_PRODUCT_ID;
  const plan = (productId === yearlyId) ? 'yearly'
    : (productId === monthlyId ? 'monthly' : (productId === tripwireId ? 'tripwire' : (sub.plan || 'monthly')));

  let status = 'active';
  const t = type.toLowerCase();
  // Refund / chargeback revokes access (must come before cancel/past_due so a
  // refund event is not misread as a mere cancellation).
  if (t.includes('refund') || t.includes('chargeback') || t.includes('dispute')) status = 'refunded';
  else if (t.includes('cancel') || t.includes('paused') || t.includes('expired')) status = 'canceled';
  else if (t.includes('failed') || t.includes('past_due')) status = 'past_due';

  // Deterministic transaction id: prefer the stable Dodo ids; only fall back to
  // the webhook event id (also stable), never to Date.now() (which let replays
  // double-accrue commission by generating a fresh id each time).
  const webhookId = payload.id || payload.webhook_id || '';
  const transactionId = sub.id || data.subscription_id || data.payment_id || data.id || webhookId || ('DODO-' + type);

  return {
    email, status, plan, productId,
    transactionId,
    webhookId,
    referralCode: (String(metadata.via || '').trim().toUpperCase()) || null,
    eventType: type,
    method: data.payment_method || sub.payment_method || 'Dodo Payments',
    grossAmount: resolveGrossAmount(data, sub),
    updatedAt: new Date().toISOString()
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const ALLOWED_ORIGINS = [
  'https://peakora-assistant.pages.dev',
  'https://peakora.life',
  'https://www.peakora.life',
  'https://peakora-api.peakora.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

function cors(response, request) {
  const origin = request ? (request.headers.get('Origin') || '') : '';
  // Affiliate portal + local dev run on the same origins; allow echo for same-site.
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  response.headers.set('Access-Control-Allow-Origin', allowOrigin);
  response.headers.set('Vary', 'Origin');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-token, x-affiliate-token, x-affiliate-email');
  response.headers.set('Access-Control-Max-Age', '86400');
  return response;
}

async function readJson(request) {
  const text = await request.text();
  try { return JSON.parse(text); }
  catch { return {}; }
}

// ── Route handlers ─────────────────────────────────────────────────────────

async function handleDodoConfig(_request, env) {
  return json({
    success: true,
    provider: 'dodo',
    environment: env.DODO_ENVIRONMENT || 'test_mode',
    configured: true,
    monthlyPrice: '$9.99',
    yearlyPrice: '$95.88',
    tripwirePrice: '$4.99',
    merchantOfRecord: 'Dodo Payments',
    monthlyLink: env.DODO_MONTHLY_PAYMENT_LINK,
    yearlyLink: env.DODO_YEARLY_PAYMENT_LINK,
    tripwireLink: env.DODO_TRIPWIRE_PAYMENT_LINK
  });
}

// Resolve the Dodo API base URL + secret API key for the configured environment.
function dodoApiCreds(env) {
  const live = (env.DODO_ENVIRONMENT || 'test_mode') === 'live_mode';
  return {
    baseUrl: live ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com',
    apiKey: live
      ? (env.DODO_PAYMENTS_LIVE_API_KEY || env.DODO_PAYMENTS_API_KEY)
      : env.DODO_PAYMENTS_API_KEY
  };
}

/**
 * Create a Dodo hosted checkout session with metadata. The affiliate referral
 * code rides along as metadata.via so the webhook can attribute the payment to
 * the affiliate who actually referred the converting customer — not the most
 * recent click globally. This is the professional, reusable attribution pattern.
 *
 * Body: { plan: 'monthly'|'yearly', email?, via? }
 * Returns: { success, checkout_url }
 */
async function handleDodoCreateCheckout(request, env) {
  let body;
  try { body = await readJson(request); }
  catch { return json({ success: false, error: 'Invalid JSON body' }, 400); }
  const planRaw = (body.plan || 'monthly').toLowerCase();
  const plan = planRaw === 'yearly' ? 'yearly' : (planRaw === 'tripwire' ? 'tripwire' : 'monthly');
  const email = (String(body.email || '')).toLowerCase().slice(0, 320);
  const via = String(body.via || '').trim().toUpperCase().slice(0, 32);
  const productId = plan === 'yearly' ? env.DODO_YEARLY_PRODUCT_ID : (plan === 'tripwire' ? env.DODO_TRIPWIRE_PRODUCT_ID : env.DODO_MONTHLY_PRODUCT_ID);
  if (!productId) return json({ success: false, error: 'Payment product not configured' }, 500);

  const { baseUrl, apiKey } = dodoApiCreds(env);
  if (!apiKey) return json({ success: false, error: 'Dodo Payments not configured' }, 500);

  const publicUrl = (env.APP_PUBLIC_URL || '').replace(/\/+$/, '');
  const returnUrl = publicUrl
    ? `${publicUrl}/thankyou.html?status=success&plan=${encodeURIComponent(plan)}`
    : '/thankyou.html?status=success&plan=' + encodeURIComponent(plan);

  const reqBody = {
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: returnUrl,
    // metadata is echoed back verbatim in the webhook payload — the source of
    // truth for "which affiliate referred THIS customer".
    metadata: { via, plan, app: 'peakora-assistant' }
  };
  if (email) reqBody.customer = { email };

  let resp;
  try {
    resp = await fetch(`${baseUrl}/checkouts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
  } catch (netErr) {
    return json({ success: false, error: 'Unable to reach Dodo Payments' }, 502);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return json({ success: false, error: `Dodo API error ${resp.status}` }, 502);
  }
  const data = await resp.json();
  return json({ success: true, checkout_url: data.checkout_url, session_id: data.session_id || data.id || null });
}

async function handleDodoWebhook(request, env) {
  const rawBody = await request.text();
  const verified = await verifyDodoWebhook(rawBody, request.headers, env.DODO_PAYMENTS_WEBHOOK_SECRET);
  if (!verified) {
    return json({ success: false, error: 'Invalid signature' }, 401);
  }
  const payload = JSON.parse(rawBody);
  const rec = mapDodoEvent(payload, env);
  if (!rec.email) {
    return json({ success: false, error: 'No email in webhook payload' }, 400);
  }

  await env.DB.prepare(
    `INSERT INTO subscriptions (email, status, plan, transaction_id, event_type, method, product_id, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET
       status=excluded.status, plan=excluded.plan, transaction_id=excluded.transaction_id,
       event_type=excluded.event_type, method=excluded.method, product_id=excluded.product_id,
       updated_at=excluded.updated_at`
  ).bind(rec.email, rec.status, rec.plan, rec.transactionId, rec.eventType, rec.method, rec.productId, rec.updatedAt).run();

  // Affiliate attribution: accrue/reverse commission for this verified payment.
  // Best-effort — a failure here must never break payment recording.
  let affiliateResult = null;
  try {
    affiliateResult = await processAffiliateAttribution(env, rec);
    if (affiliateResult) console.log(`[Affiliate] ${affiliateResult.action} | txn=${rec.transactionId}`);
  } catch (e) {
    console.warn('[Affiliate] attribution error (non-blocking):', e.message);
  }

  return json({ success: true, event_type: rec.eventType, status: rec.status, email: rec.email, affiliate: affiliateResult });
}

async function handleSubscriptionStatus(request, env) {
  const url = new URL(request.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!email) return json({ success: true, status: 'free', isPlus: false });

  // Master account — always full access, bypasses all paywalls
  const MASTER_EMAIL = 'peakora.network@gmail.com';
  if (email === MASTER_EMAIL) {
    return json({ success: true, email, status: 'active', plan: 'master', isPlus: true, isMaster: true });
  }

  const row = await env.DB.prepare(
    'SELECT email, status, plan, updated_at FROM subscriptions WHERE email = ?'
  ).bind(email).first();

  if (row) {
    return json({ success: true, ...row, isPlus: row.status === 'active' });
  }
  return json({ success: true, email, status: 'free', isPlus: false });
}

async function handleSubscribe(request, env) {
  const body = await readJson(request);
  const email = (body.email || '').trim().toLowerCase();
  const source = body.source || 'app';
  if (!EMAIL_RE.test(email)) return json({ success: false, error: 'Invalid email address.' }, 400);

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO subscribers (email, source, consent, sequence, subscribed_at, last_seen_at)
     VALUES (?, ?, 1, 'welcome-3', ?, ?)
     ON CONFLICT(email) DO UPDATE SET last_seen_at=excluded.last_seen_at, source=excluded.source`
  ).bind(email, source, now, now).run();

  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM subscribers').first();

  // Fire email #1 of the welcome sequence immediately (best-effort; a failure
  // here must never block the signup response). The cron advances steps 2 and 3.
  try { await sendWelcomeImmediate(env, email); } catch (e) {
    console.warn('[Subscribe] welcome email error (non-blocking):', e && e.message);
  }

  return json({ success: true, total: count?.n || 0 });
}

async function handleFeedback(request, env) {
  const body = await readJson(request);
  const message = (body.message || '').trim().slice(0, 2000);
  if (!message) return json({ success: false, error: 'Message is empty.' }, 400);

  const id = 'fb_' + Date.now();
  await env.DB.prepare(
    'INSERT INTO feedback (id, message, rating, page, email, timestamp) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, message, body.rating || null, body.page || '', (body.email || '').toLowerCase() || null, new Date().toISOString()).run();

  return json({ success: true });
}

async function handleEvent(request, env) {
  const body = await readJson(request);
  const action = (body.action || '').slice(0, 80);
  if (!action) return json({ success: false }, 400);

  await env.DB.prepare(
    'INSERT INTO events (action, details, timestamp) VALUES (?, ?, ?)'
  ).bind(action, JSON.stringify(body.details || {}), body.timestamp || new Date().toISOString()).run();

  return json({ success: true });
}

async function handleStats(_request, env) {
  const [subs, feedback, events, activeSubs] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as n FROM subscribers').first(),
    env.DB.prepare('SELECT COUNT(*) as n FROM feedback').first(),
    env.DB.prepare('SELECT COUNT(*) as n FROM events').first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM subscriptions WHERE status = 'active'").first(),
  ]);
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const active24 = await env.DB.prepare('SELECT COUNT(*) as n FROM events WHERE timestamp > ?').bind(dayAgo).first();
  const topActions = await env.DB.prepare(
    'SELECT action, COUNT(*) as cnt FROM events GROUP BY action ORDER BY cnt DESC LIMIT 20'
  ).all();

  return json({
    success: true,
    subscribers: subs?.n || 0,
    feedback: feedback?.n || 0,
    events: events?.n || 0,
    activeLast24h: active24?.n || 0,
    activeSubscriptions: activeSubs?.n || 0,
    topActions: (topActions.results || []).map(r => [r.action, r.cnt])
  });
}

// ── Email insights dashboard data ─────────────────────────────────────────
// Unifies every email-bearing table into one admin view: subscribers,
// paying subscriptions, affiliates, feedback, and the users table. Returns
// per-email records plus aggregate insights (growth, sources, conversion,
// funnel, plan mix, geography from email domain, sequence state).

function domainOf(email) {
  if (!email || typeof email !== 'string') return null;
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const d = email.slice(at + 1).toLowerCase();
  return d || null;
}

function providerOf(domain) {
  if (!domain) return 'unknown';
  const free = ['gmail.com','yahoo.com','outlook.com','hotmail.com','live.com','msn.com',
    'icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','zoho.com',
    'gmx.com','mail.com','yandex.com','tutanota.com','fastmail.com'];
  if (free.includes(domain)) return 'free';
  return 'business';
}

/** Merge every email-bearing table into one unified per-email record set.
 *  Returns { records, byEmail } where records already has a derived `stage`. */
async function buildEmailRecords(env) {
  const [subsRows, payRows, affRows, fbRows, userRows] = await Promise.all([
    env.DB.prepare('SELECT email, source, consent, sequence, subscribed_at, last_seen_at FROM subscribers').all(),
    env.DB.prepare("SELECT email, status, plan, transaction_id, event_type, method, product_id, updated_at, created_at FROM subscriptions").all(),
    env.DB.prepare("SELECT user_email AS email, display_name, referral_code, status, commission_rate, applied_at AS created_at FROM affiliates").all(),
    env.DB.prepare('SELECT email, message, rating, page, timestamp FROM feedback').all(),
    env.DB.prepare('SELECT email, display_name, created_at FROM users').all(),
  ]);

  const byEmail = new Map();
  function ensure(email) {
    const e = String(email || '').toLowerCase();
    if (!EMAIL_RE.test(e)) return null;
    let rec = byEmail.get(e);
    if (!rec) {
      const domain = domainOf(e);
      rec = {
        email: e, domain, provider: providerOf(domain),
        sources: [], firstSeen: null, lastSeen: null,
        isNewsletter: false, newsletterSource: null, newsletterAt: null, sequence: null,
        isPaid: false, payStatus: null, plan: null, paidAt: null, transactionId: null,
        isAffiliate: false, affStatus: null, referralCode: null, affCreatedAt: null, displayName: null,
        hasFeedback: false, feedbackCount: 0, lastFeedbackAt: null,
        hasAccount: false, accountCreatedAt: null,
      };
      byEmail.set(e, rec);
    }
    return rec;
  }
  function touch(rec, iso) {
    if (!iso) return;
    if (!rec.firstSeen || iso < rec.firstSeen) rec.firstSeen = iso;
    if (!rec.lastSeen || iso > rec.lastSeen) rec.lastSeen = iso;
  }

  for (const r of (subsRows.results || [])) {
    const rec = ensure(r.email); if (!rec) continue;
    rec.isNewsletter = true;
    rec.newsletterSource = r.source || rec.newsletterSource;
    rec.sequence = r.sequence || rec.sequence;
    rec.newsletterAt = r.subscribed_at || rec.newsletterAt;
    if (r.source && !rec.sources.includes(r.source)) rec.sources.push(r.source);
    touch(rec, r.subscribed_at); touch(rec, r.last_seen_at);
  }
  for (const r of (payRows.results || [])) {
    const rec = ensure(r.email); if (!rec) continue;
    rec.isPaid = true; rec.payStatus = r.status; rec.plan = r.plan;
    rec.transactionId = r.transaction_id; rec.paidAt = r.updated_at || r.created_at;
    touch(rec, r.updated_at); touch(rec, r.created_at);
  }
  for (const r of (affRows.results || [])) {
    const rec = ensure(r.email); if (!rec) continue;
    rec.isAffiliate = true; rec.affStatus = r.status; rec.referralCode = r.referral_code;
    rec.affCreatedAt = r.created_at; rec.displayName = r.display_name || rec.displayName;
    touch(rec, r.created_at);
  }
  for (const r of (fbRows.results || [])) {
    const rec = ensure(r.email); if (!rec) continue;
    rec.hasFeedback = true; rec.feedbackCount++; rec.lastFeedbackAt = r.timestamp;
    touch(rec, r.timestamp);
  }
  for (const r of (userRows.results || [])) {
    const rec = ensure(r.email); if (!rec) continue;
    rec.hasAccount = true; rec.accountCreatedAt = r.created_at;
    rec.displayName = r.display_name || rec.displayName;
    touch(rec, r.created_at);
  }

  for (const r of byEmail.values()) {
    if (r.isPaid) r.stage = r.payStatus === 'active' ? 'customer' : (r.payStatus === 'refunded' ? 'churned' : 'lapsed');
    else if (r.isAffiliate) r.stage = 'partner';
    else if (r.hasFeedback) r.stage = 'engaged';
    else if (r.isNewsletter) r.stage = 'subscriber';
    else r.stage = 'lead';
  }
  return { records: Array.from(byEmail.values()), byEmail };
}

/** CSV export of the full unified email list (admin only). */
async function handleEmailsExportCsv(request, env) {
  const { records } = await buildEmailRecords(env);
  records.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  const header = ['email','name','domain','provider','stage','sources','newsletter','sequence','newsletterAt',
    'paid','payStatus','plan','paidAt','transactionId','affiliate','affStatus','referralCode','affCreatedAt',
    'feedbackCount','lastFeedbackAt','hasAccount','firstSeen','lastSeen'];
  const esc = (v) => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('; ') : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = records.map(r => [
    r.email, r.displayName, r.domain, r.provider, r.stage, r.sources.join('; '),
    r.isNewsletter ? 'yes' : '', r.sequence, r.newsletterAt,
    r.isPaid ? 'yes' : '', r.payStatus, r.plan, r.paidAt, r.transactionId,
    r.isAffiliate ? 'yes' : '', r.affStatus, r.referralCode, r.affCreatedAt,
    r.feedbackCount, r.lastFeedbackAt, r.hasAccount ? 'yes' : '',
    r.firstSeen, r.lastSeen
  ].map(esc).join(','));
  const csv = header.join(',') + '\n' + rows.join('\n');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="peakora-emails.csv"',
      'Access-Control-Allow-Origin': '*'
    }
  });
}


async function handleEmailInsights(request, env) {
  const q = (param) => new URL(request.url).searchParams.get(param) || '';
  const search = q('search').trim().toLowerCase();
  const sourceFilter = q('source').trim().toLowerCase();
  const segment = q('segment').trim().toLowerCase(); // all|newsletter|paid|affiliate|feedback
  const page = Math.max(1, parseInt(q('page') || '1', 10) || 1);
  const perPage = Math.min(200, Math.max(1, parseInt(q('perPage') || '50', 10) || 50));

  const { records: allRecords, byEmail } = await buildEmailRecords(env);

  // Apply segment + search + source filters to the paged view.
  let records = allRecords.slice();
  if (segment && segment !== 'all') {
    records = records.filter(r =>
      segment === 'newsletter' ? r.isNewsletter :
      segment === 'paid' ? r.isPaid :
      segment === 'affiliate' ? r.isAffiliate :
      segment === 'feedback' ? r.hasFeedback :
      segment === 'customer' ? (r.isPaid && r.payStatus === 'active') :
      segment === 'churned' ? (r.isPaid && r.payStatus !== 'active') :
      true
    );
  }
  if (sourceFilter) records = records.filter(r => r.sources.some(s => s.includes(sourceFilter)));
  if (search) records = records.filter(r =>
    r.email.includes(search) ||
    (r.displayName || '').toLowerCase().includes(search) ||
    (r.domain || '').includes(search)
  );

  records.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));

  // ── Aggregate insights (computed over the FULL set, not the filtered view) ──
  const all = Array.from(byEmail.values());
  const totalEmails = all.length;
  const newsletter = all.filter(r => r.isNewsletter).length;
  const paid = all.filter(r => r.isPaid).length;
  const activePaid = all.filter(r => r.isPaid && r.payStatus === 'active').length;
  const refunded = all.filter(r => r.payStatus === 'refunded').length;
  const partners = all.filter(r => r.isAffiliate).length;
  const withFeedback = all.filter(r => r.hasFeedback).length;
  const withAccount = all.filter(r => r.hasAccount).length;

  // Conversion funnel
  const funnel = {
    leads: totalEmails,
    newsletter: newsletter,
    engaged: all.filter(r => r.hasFeedback).length,
    paid: paid,
    active: activePaid,
    partners: partners,
  };
  const newsletterToPaid = newsletter > 0 ? +(paid / newsletter * 100).toFixed(1) : 0;
  const leadToPaid = totalEmails > 0 ? +(paid / totalEmails * 100).toFixed(1) : 0;

  // Sources breakdown
  const sourceCounts = {};
  for (const r of all) for (const s of r.sources) sourceCounts[s] = (sourceCounts[s] || 0) + 1;
  const sources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ source: k, count: v }));

  // Plan mix (paid)
  const planCounts = {};
  for (const r of all) if (r.plan) planCounts[r.plan] = (planCounts[r.plan] || 0) + 1;
  const plans = Object.entries(planCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ plan: k, count: v }));

  // Email provider mix (free vs business)
  const providerCounts = { free: 0, business: 0, unknown: 0 };
  for (const r of all) providerCounts[r.provider] = (providerCounts[r.provider] || 0) + 1;

  // Top domains
  const domainCounts = {};
  for (const r of all) if (r.domain) domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => ({ domain: k, count: v }));

  // Stage distribution
  const stageCounts = {};
  for (const r of all) stageCounts[r.stage] = (stageCounts[r.stage] || 0) + 1;
  const stages = Object.entries(stageCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ stage: k, count: v }));

  // Growth: signups per day for last 30 days (newsletter subscribed_at)
  const days = {};
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    days[d] = 0;
  }
  for (const r of all) {
    if (!r.newsletterAt) continue;
    const d = r.newsletterAt.slice(0, 10);
    if (days.hasOwnProperty(d)) days[d]++;
  }
  const growth = Object.entries(days).map(([date, count]) => ({ date, count }));

  // Sequence state (for the email engine — chunk E)
  const seqCounts = {};
  for (const r of all) if (r.sequence) seqCounts[r.sequence] = (seqCounts[r.sequence] || 0) + 1;
  const sequences = Object.entries(seqCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ sequence: k, count: v }));

  // Pagination
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const slice = records.slice((page - 1) * perPage, page * perPage);

  return json({
    success: true,
    insights: {
      totalEmails, newsletter, paid, activePaid, refunded, partners, withFeedback, withAccount,
      conversion: { newsletterToPaid, leadToPaid },
      funnel,
      sources, plans, providerCounts, topDomains, stages, growth, sequences,
    },
    records: slice,
    pagination: { page, perPage, total, totalPages },
  });
}

async function handlePushSubscribe(request, env) {
  const body = await readJson(request);
  if (!body || !body.endpoint) return json({ success: false }, 400);
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, keys, created_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(endpoint) DO UPDATE SET keys=excluded.keys`
  ).bind(body.endpoint, JSON.stringify(body.keys || {})).run();
  return json({ success: true });
}

async function handlePushUnsubscribe(request, env) {
  const body = await readJson(request);
  const endpoint = body.endpoint;
  if (!endpoint) return json({ success: false }, 400);
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return json({ success: true });
}

async function handlePushKey(_request, env) {
  if (!env.VAPID_PUBLIC_KEY) return json({ success: false, error: 'VAPID not configured' }, 500);
  return json({ success: true, key: env.VAPID_PUBLIC_KEY });
}

const DAILY_NUDGES = [
  { title: 'Peakora', body: 'A small step today keeps momentum real. Open your plan when you are ready.' },
  { title: 'Peakora', body: 'One quiet check-in can shift the day. Your plan is here when you are.' },
  { title: 'Peakora', body: 'No streaks to break. Just a gentle next step waiting for you.' },
  { title: 'Peakora', body: 'Your 7-day plan is pacing itself around you. Drop in anytime.' },
  { title: 'Peakora', body: 'Progress is quiet. Take a breath, then take one step.' }
];

async function handlePushBroadcast(request, env) {
  const body = await readJson(request);
  const title = (body && body.title) || 'Peakora';
  const message = (body && body.body) || 'A gentle nudge from your quiet corner.';
  const rows = await env.DB.prepare('SELECT endpoint, keys FROM push_subscriptions').all();
  const subs = (rows.results || []).map(r => ({
    endpoint: r.endpoint,
    keys: typeof r.keys === 'string' ? JSON.parse(r.keys) : (r.keys || {})
  })).filter(s => s.keys && s.keys.p256dh && s.keys.auth);

  let delivered = 0, failed = 0;
  const payload = JSON.stringify({ title, body: message });
  for (const sub of subs) {
    try {
      const r = await sendWebPush(sub, payload, env);
      if (r.ok) delivered++; else failed++;
      // 404/410 = subscription gone/expired -> clean it up.
      if (r.status === 404 || r.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      }
    } catch (e) { failed++; }
  }
  return json({ success: true, delivered, failed, total: subs.length });
}

// Admin: list subscribed devices (endpoint is the per-machine push URL).
async function handlePushListSubscriptions(_request, env) {
  const rows = await env.DB.prepare(
    'SELECT endpoint, created_at FROM push_subscriptions ORDER BY created_at DESC'
  ).all();
  const subs = (rows.results || []).map(r => {
    let provider = 'unknown';
    try { const h = new URL(r.endpoint).host; provider = h; } catch (e) {}
    return {
      endpoint: r.endpoint,
      provider,
      created_at: r.created_at
    };
  });
  return json({ success: true, total: subs.length, subscriptions: subs });
}

// Admin: send a push to a single device endpoint (targeted per-machine).
async function handlePushSend(request, env) {
  const body = await readJson(request);
  const endpoint = body && body.endpoint;
  const title = (body && body.title) || 'Peakora';
  const message = (body && body.body) || 'A gentle nudge from your quiet corner.';
  if (!endpoint) return json({ success: false, error: 'endpoint required' }, 400);
  const row = await env.DB.prepare('SELECT endpoint, keys FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).first();
  if (!row) return json({ success: false, error: 'subscription not found' }, 404);
  const sub = { endpoint: row.endpoint, keys: typeof row.keys === 'string' ? JSON.parse(row.keys) : (row.keys || {}) };
  if (!sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ success: false, error: 'subscription missing keys' }, 400);
  const payload = JSON.stringify({ title, body: message });
  try {
    const r = await sendWebPush(sub, payload, env);
    if (r.status === 404 || r.status === 410) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      return json({ success: false, error: 'subscription expired and was removed', status: r.status }, 410);
    }
    return json({ success: r.ok, status: r.status, delivered: r.ok ? 1 : 0 });
  } catch (e) {
    return json({ success: false, error: String(e && e.message || e) }, 500);
  }
}

// Daily gentle nudge to all subscribed devices (called by the Cron Trigger).
async function sendDailyNudge(env) {
  const rows = await env.DB.prepare('SELECT endpoint, keys FROM push_subscriptions').all();
  const subs = (rows.results || []).map(r => ({
    endpoint: r.endpoint,
    keys: typeof r.keys === 'string' ? JSON.parse(r.keys) : (r.keys || {})
  })).filter(s => s.keys && s.keys.p256dh && s.keys.auth);

  const nudge = DAILY_NUDGES[new Date().getUTCDay() % DAILY_NUDGES.length];
  const payload = JSON.stringify(nudge);
  let delivered = 0;
  for (const sub of subs) {
    try {
      const r = await sendWebPush(sub, payload, env);
      if (r.ok) delivered++;
      if (r.status === 404 || r.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      }
    } catch (e) {}
  }
  return { delivered, total: subs.length };
}

// ── Router ─────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }), request);
    }

    let response;
    try {
      if (path === '/dodo/config' && method === 'GET') {
        response = await handleDodoConfig(request, env);
      } else if (path === '/dodo/create-checkout' && method === 'POST') {
        response = await handleDodoCreateCheckout(request, env);
      } else if (path === '/dodo/webhook' && method === 'POST') {
        response = await handleDodoWebhook(request, env);
      } else if (path === '/subscription-status' && method === 'GET') {
        response = await handleSubscriptionStatus(request, env);
      } else if (path === '/subscribe' && method === 'POST') {
        response = await handleSubscribe(request, env);
      } else if (path === '/feedback' && method === 'POST') {
        response = await handleFeedback(request, env);
      } else if (path === '/event' && method === 'POST') {
        response = await handleEvent(request, env);
      } else if (path === '/stats' && method === 'GET') {
        if (!requireAdmin(request, env)) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleStats(request, env);
      } else if (path === '/admin/emails' && method === 'GET') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleEmailInsights(request, env);
      } else if (path === '/admin/emails/export.csv' && method === 'GET') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleEmailsExportCsv(request, env);
      } else if (path === '/admin/email/preview' && method === 'GET') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else {
          const step = new URL(request.url).searchParams.get('step') || '1';
          response = new Response(previewEmail(step), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      } else if (path === '/admin/email/test' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else {
          const body = await readJson(request);
          const to = (body.to || '').trim().toLowerCase();
          const step = body.step || 1;
          if (!EMAIL_RE.test(to)) response = json({ success: false, error: 'Valid to email required.' }, 400);
          else response = json(await sendTestEmail(env, to, step));
        }
      } else if (path === '/push-subscribe' && method === 'POST') {
        response = await handlePushSubscribe(request, env);
      } else if (path === '/push-unsubscribe' && method === 'POST') {
        response = await handlePushUnsubscribe(request, env);
      } else if (path === '/push-key' && method === 'GET') {
        response = await handlePushKey(request, env);
      } else if (path === '/push-broadcast' && method === 'POST') {
        if (!requireAdmin(request, env)) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handlePushBroadcast(request, env);
      } else if (path === '/push-subscriptions' && method === 'GET') {
        if (!requireAdmin(request, env)) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handlePushListSubscriptions(request, env);
      } else if (path === '/push-send' && method === 'POST') {
        if (!requireAdmin(request, env)) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handlePushSend(request, env);

      /* ── Affiliate program: public + partner routes ── */
      } else if (path === '/affiliate/click' && method === 'GET') {
        response = await handleAffiliateClick(request, env);
      } else if (path === '/affiliate/apply' && method === 'POST') {
        response = await handleAffiliateApply(request, env);
      } else if (path === '/affiliate/login' && method === 'POST') {
        response = await handleAffiliateLogin(request, env);
      } else if (path === '/affiliate/set-password' && method === 'POST') {
        response = await handleAffiliateSetPassword(request, env);
      } else if (path === '/affiliate/dashboard' && method === 'GET') {
        response = await handleAffiliateDashboard(request, env);
      } else if (path === '/affiliate/link' && method === 'POST') {
        response = await handleAffiliateLink(request, env);
      } else if (path === '/affiliate/payout-setup' && method === 'POST') {
        response = await handleAffiliatePayoutSetup(request, env);
      } else if (path === '/affiliate/request-payout' && method === 'POST') {
        response = await handleAffiliateRequestPayout(request, env);

      /* ── Affiliate program: Google sign-in ── */
      } else if (path === '/affiliate/google/start' && method === 'GET') {
        response = await handleAffiliateGoogleStart(request, env);
      } else if (path === '/affiliate/google/callback' && method === 'GET') {
        response = await handleAffiliateGoogleCallback(request, env);

      /* ── Affiliate program: admin routes (ADMIN_TOKEN or signed-in admin) ── */
      } else if (path === '/affiliate/admin/verify' && method === 'GET') {
        response = await handleAdminVerifyPartner(request, env);
      } else if (path === '/affiliate/admin/list' && method === 'GET') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminListAffiliates(request, env);
      } else if (path === '/affiliate/admin/approve' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminApproveAffiliate(request, env);
      } else if (path === '/affiliate/admin/reject' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminRejectAffiliate(request, env);
      } else if (path === '/affiliate/admin/delete' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminDeleteAffiliate(request, env);
      } else if (path === '/affiliate/admin/adjust-commission' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminAdjustCommission(request, env);
      } else if (path === '/affiliate/admin/set-password' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminSetAffiliatePassword(request, env);
      } else if (path === '/affiliate/admin/ledger' && method === 'GET') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminCommissionLedger(request, env);
      } else if (path === '/affiliate/admin/fulfill-payout' && method === 'POST') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminFulfillPayout(request, env);
      } else if (path === '/affiliate/admin/export.csv' && method === 'GET') {
        if (!(await requireAdminOrPartner(request, env))) response = json({ success: false, error: 'Admin token required' }, 403);
        else response = await handleAdminExportCsv(request, env);
      } else {
        response = json({ success: false, error: 'Not found', path }, 404);
      }
    } catch (error) {
      console.error('Worker error:', error);
      response = json({ success: false, error: 'Internal server error' }, 500);
    }

    return cors(response, request);
  },

  // Cron Trigger: one gentle daily nudge to all subscribed devices + the
  // self-hosted email welcome sequence advance.
  async scheduled(_event, env, _ctx) {
    await sendDailyNudge(env);
    try { await runSequenceTick(env); } catch (e) {
      console.warn('[Cron] email sequence tick error (non-blocking):', e && e.message);
    }
  }
};
