// Copyright (c) 2026 Peakora. All rights reserved. Licensed under the MIT License; see NOTICE and LICENSE.
/**
 * Peakora self-hosted email sequence engine.
 *
 * Replaces MailerLite with a fully owned pipeline:
 *   - Templates live in this repo (Peakora dark-luxury design), version-controlled.
 *   - Recipients + progress live in D1 (the `subscribers` + `email_sends` tables).
 *   - Sending uses Resend (https://resend.com) via its REST API — one env secret.
 *   - Scheduling rides the existing Worker cron trigger (0 9 * * * UTC), so no
 *     extra infra and no GitHub Actions runner minutes are consumed.
 *
 * The sequence is "welcome-3": a 3-email welcome drip sent over the first week
 * after a newsletter signup, then the subscriber moves to a weekly nurture cadence.
 *
 * Env:
 *   RESEND_API_KEY   — Resend API key (set via `wrangler secret put RESEND_API_KEY`)
 *   FROM_EMAIL       — sender address (default: hello@peakora.life)
 *                      IMPORTANT: must be on a verified Resend domain.
 *
 * D1 tables (added to schema.sql):
 *   email_sends (id, email, sequence, step, status, resend_id, sent_at, error)
 *
 * Public API (for the Worker router):
 *   sendWelcomeImmediate(env, email)  — send email #1 right at signup
 *   runSequenceTick(env)              — advance the drip for due subscribers
 */

const FROM_EMAIL = 'Peakora <hello@peakora.life>';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// ── Sequence definition ───────────────────────────────────────────────────
// delayHours is measured from the subscriber's subscribed_at (email #1 is sent
// immediately at signup, so delayHours:0). Each step is sent at most once.
const WELCOME_SEQUENCE = [
  {
    step: 1,
    delayHours: 0,
    subject: 'Your 5-Minute Reset is inside',
    preheader: 'Read it in about two minutes, act on it in five.',
    body: `Hi there,

Welcome to Peakora. Thank you for trusting this corner with your inbox.

No overwhelm. No 47-step morning routine. Just one small, honest step you can take today to feel a little more like yourself.

Over the next few days I will send you three short notes. Each one is a single idea you can read in under a minute and act on in under five. That is the whole promise. Here is what is inside:

1. The morning check-in - two minutes, one honest feeling, no streaks.
2. The breath ring - one slow 4-2-6 round, right at your desk.
3. The mood pattern - how your week actually feels at a glance;
4. The wind-down - five minutes to hand your day back;
5. A soundscape, if today needs one - rain, bowl, or ocean.

Pick one today. Just one. The others will still be here tomorrow.

If now is not the right moment, no pressure. This corner stays quiet until you are ready.

Take one breath,
The Peakora team`,
    ctaLabel: 'Open the Assistant',
    ctaUrl: 'https://peakora-assistant.pages.dev/assistant.html',
  },
  {
    step: 2,
    delayHours: 24,
    subject: 'The one-list method (it works because it is small)',
    preheader: 'A single list, not a system.',
    body: `Hi again,

Today's idea is almost embarrassingly simple: write down one thing.

Not a master plan. Not a prioritized matrix. One thing that, if you did it today, would make tomorrow feel a little lighter.

Then do it. That is the whole method.

The reason it works is not the doing - it is the deciding. You stop carrying the mental weight of "what should I..." and let one small action prove to you that momentum is possible.

Pick your one thing.

The Peakora team`,
    ctaLabel: 'Start your one list',
    ctaUrl: 'https://peakora-assistant.pages.dev/assistant.html',
  },
  {
    step: 3,
    delayHours: 72,
    subject: 'What to do when the momentum drops',
    preheader: 'It always drops. Here is the restart.',
    body: `Hi,

By day three, most people feel the dip. The first burst fades and the old weight creeps back.

That is not failure. It is the pattern.

The restart is smaller than you think: do not rebuild the whole routine. Do the smallest version of the thing that worked on day one. A one-minute version. A worse version. Just the shape of it.

Momentum is not sustained - it is rekindled. Repeatedly. That is the skill.

You are doing fine,

P.S. There is a smaller step than the plan itself: the Quiet Start Mini Pack ($4.99 one-time) gives you 5 calm soundscapes to keep forever, no subscription and no streak to protect. If the plan feels too big today, that room is enough.
The Peakora team`,
    ctaLabel: 'Get the Quiet Start Mini Pack',
    ctaUrl: 'https://peakora-assistant.pages.dev/assistant.html?open=tripwire',
  },
];

// ── HTML template (Peakora dark luxury wellness design) ───────────────────
function renderEmailHtml(step, opts) {
  const year = new Date().getUTCFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0c0a15;font-family:'Inter',system-ui,-apple-system,sans-serif;color:#f8fafc;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0c0a15;min-width:100%;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#151122;border:1px solid rgba(255,255,255,0.08);border-radius:24px;box-shadow:0 28px 70px rgba(0,0,0,0.9);overflow:hidden;">
        <!-- Brand header -->
        <tr><td style="padding:28px 32px 0;text-align:center;">
          <div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:0.08em;color:#ffffff;">PEAKORA</div>
          <div style="font-size:12px;color:#a0aec0;margin-top:4px;letter-spacing:0.04em;">Gentle guidance. Real momentum.</div>
        </td></tr>
        <!-- Preheader / step indicator -->
        <tr><td style="padding:14px 32px 0;text-align:center;">
          <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(224,122,95,0.18);color:#f4a261;font-size:11px;font-weight:700;letter-spacing:0.05em;">Note ${step} of 3</span>
        </td></tr>
        <!-- Subject -->
        <tr><td style="padding:18px 32px 0;">
          <h1 style="font-family:'Plus Jakarta Sans',sans-serif;font-size:24px;font-weight:800;color:#ffffff;margin:0;line-height:1.25;">${escapeHtml(opts.subject)}</h1>
        </td></tr>
        <!-- Preheader line -->
        <tr><td style="padding:6px 32px 0;">
          <p style="font-size:14px;color:#a0aec0;font-style:italic;margin:0;">${escapeHtml(opts.preheader)}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:20px 32px 8px;">
          <p style="font-size:15px;line-height:1.7;color:#e2e8f0;white-space:pre-line;margin:0 0 16px;">${escapeHtml(opts.body)}</p>
        </td></tr>
        <!-- CTA -->
        <tr><td style="padding:8px 32px 28px;text-align:center;">
          <a href="${escapeAttr(opts.ctaUrl)}" style="display:inline-block;padding:14px 32px;border-radius:12px;background:linear-gradient(135deg,#e07a5f,#f4a261);color:#ffffff;font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.02em;">${escapeHtml(opts.ctaLabel)}</a>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding:0 32px;">
          <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(244,162,97,0.4),transparent);"></div>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px 28px;text-align:center;">
          <p style="font-size:12px;color:#a0aec0;margin:0 0 8px;line-height:1.5;">You receive these notes because you joined Peakora. Reply any time - a real person reads every reply.</p>
          <p style="font-size:11px;color:#718096;margin:0;">
            <a href="https://peakora-assistant.pages.dev/assistant.html" style="color:#a0aec0;text-decoration:underline;">Open the Assistant</a>
            &nbsp;&middot;&nbsp;
            <a href="https://peakora-assistant.pages.dev/pricing.html" style="color:#a0aec0;text-decoration:underline;">See plans</a>
          </p>
          <p style="font-size:11px;color:#5a6478;margin:12px 0 0;">&copy; ${year} Peakora. For a Better You.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c];
  });
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ── Resend transport ──────────────────────────────────────────────────────
async function sendViaResend(env, { to, subject, html, text }) {
  if (!env.RESEND_API_KEY) {
    return { ok: false, status: 0, error: 'RESEND_API_KEY not set' };
  }
  const payload = {
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
    text: text || subject,
    tags: [{ name: 'source', value: 'peakora-sequence' }],
  };
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok) {
      return { ok: true, status: r.status, id: data.id || null };
    }
    return { ok: false, status: r.status, error: (data && (data.message || data.error)) || ('Resend HTTP ' + r.status) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e && e.message || e) };
  }
}

// ── D1 send record ─────────────────────────────────────────────────────────
async function recordSend(env, email, sequence, step, result) {
  const id = 'es_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  await env.DB.prepare(
    `INSERT INTO email_sends (id, email, sequence, step, status, resend_id, sent_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, email, sequence, step,
    result.ok ? 'sent' : 'failed',
    result.id || null,
    new Date().toISOString(),
    result.error || null
  ).run();
}

/** Has this (email, sequence, step) already been sent? Prevents duplicates. */
async function alreadySent(env, email, sequence, step) {
  const row = await env.DB.prepare(
    `SELECT id FROM email_sends WHERE email = ? AND sequence = ? AND step = ? AND status = 'sent' LIMIT 1`
  ).bind(email, sequence, step).first();
  return !!row;
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Send email #1 immediately at signup (best-effort, never blocks /subscribe). */
export async function sendWelcomeImmediate(env, email) {
  try {
    const tpl = WELCOME_SEQUENCE[0];
    if (await alreadySent(env, email, 'welcome-3', tpl.step)) return { skipped: true };
    const result = await sendViaResend(env, {
      to: email,
      subject: tpl.subject,
      html: renderEmailHtml(tpl.step, tpl),
      text: tpl.body + '\n\n' + tpl.ctaLabel + ': ' + tpl.ctaUrl,
    });
    await recordSend(env, email, 'welcome-3', tpl.step, result);
    // Advance the subscriber's sequence progress marker.
    await env.DB.prepare(
      `UPDATE subscribers SET sequence = 'welcome-3' WHERE email = ?`
    ).bind(email).run();
    return result;
  } catch (e) {
    console.warn('[EmailSeq] welcome immediate error (non-blocking):', e && e.message);
    return { ok: false, error: String(e && e.message || e) };
  }
}

/** Cron tick: for every subscriber on the welcome-3 sequence, send the next
 *  due email based on elapsed time since subscribed_at. Idempotent. */
export async function runSequenceTick(env) {
  if (!env.RESEND_API_KEY) {
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }
  const now = Date.now();
  let sent = 0, skipped = 0, failed = 0;

  // Load all newsletter subscribers still on the welcome sequence.
  const rows = await env.DB.prepare(
    `SELECT email, sequence, subscribed_at FROM subscribers WHERE consent = 1`
  ).all();

  for (const sub of (rows.results || [])) {
    if (!sub.email || !sub.subscribed_at) continue;
    const subTime = new Date(sub.subscribed_at).getTime();
    if (isNaN(subTime)) continue;
    const elapsedHours = (now - subTime) / 3600000;

    for (const tpl of WELCOME_SEQUENCE) {
      if (elapsedHours < tpl.delayHours) break; // not due yet for this or later steps
      if (await alreadySent(env, sub.email, 'welcome-3', tpl.step)) continue; // already sent
      const result = await sendViaResend(env, {
        to: sub.email,
        subject: tpl.subject,
        html: renderEmailHtml(tpl.step, tpl),
        text: tpl.body + '\n\n' + tpl.ctaLabel + ': ' + tpl.ctaUrl,
      });
      await recordSend(env, sub.email, 'welcome-3', tpl.step, result);
      if (result.ok) sent++; else failed++;
      // One email per tick per subscriber, to avoid bursting.
      break;
    }
    skipped++;
  }

  return { sent, failed, considered: (rows.results || []).length };
}

/** Admin: preview an email as HTML (no sending). */
export function previewEmail(step) {
  const tpl = WELCOME_SEQUENCE.find(t => t.step === Number(step)) || WELCOME_SEQUENCE[0];
  return renderEmailHtml(tpl.step, tpl);
}

/** Admin: send a test email to one address. */
export async function sendTestEmail(env, to, step) {
  const tpl = WELCOME_SEQUENCE.find(t => t.step === Number(step)) || WELCOME_SEQUENCE[0];
  const result = await sendViaResend(env, {
    to,
    subject: '[TEST] ' + tpl.subject,
    html: renderEmailHtml(tpl.step, tpl),
    text: tpl.body,
  });
  return result;
}
