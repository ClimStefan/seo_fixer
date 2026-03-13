/**
 * lib/email.js
 *
 * Email sending via Resend (resend.com).
 * Resend is the simplest modern email API — one endpoint, great DX.
 *
 * Setup:
 *   1. Sign up at resend.com (free tier: 3,000 emails/month)
 *   2. Add a sending domain (or use their onboarding.resend.dev for testing)
 *   3. Get your API key from the dashboard
 *   4. Add to .env.local:
 *        RESEND_API_KEY=re_...
 *        EMAIL_FROM=SEOFix <alerts@yourdomain.com>
 */

const RESEND_API = 'https://api.resend.com/emails';

/**
 * sendNewIssuesEmail
 *
 * Sends the daily monitoring alert when new SEO issues are detected.
 * Groups issues by severity so critical ones are shown first.
 *
 * @param {object} params
 * @param {string} params.to       — recipient email
 * @param {string} params.name     — recipient first name
 * @param {string} params.domain   — e.g. "https://yoursite.com"
 * @param {Array}  params.newIssues — array of new issue objects
 */
export async function sendNewIssuesEmail({ to, name, domain, newIssues }) {
  const critical = newIssues.filter(i => i.severity === 'critical');
  const warning  = newIssues.filter(i => i.severity === 'warning');
  const info     = newIssues.filter(i => i.severity === 'info');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://seo-fixer.vercel.app';
  const domainDisplay = domain.replace('https://', '').replace('http://', '');

  const subject = critical.length > 0
    ? `🚨 ${critical.length} critical SEO issue${critical.length > 1 ? 's' : ''} found on ${domainDisplay}`
    : `📋 ${newIssues.length} new SEO issue${newIssues.length > 1 ? 's' : ''} found on ${domainDisplay}`;

  const html = buildEmailHtml({
    name,
    domain,
    domainDisplay,
    appUrl,
    critical,
    warning,
    info,
    total: newIssues.length,
  });

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'SEOFix <alerts@seofix.io>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${err.message || JSON.stringify(err)}`);
  }

  return res.json();
}

// ─────────────────────────────────────────
// EMAIL HTML BUILDER
// Clean, dark-themed HTML email that looks good in all clients.
// Uses inline styles only — no external CSS (email clients strip it).
// ─────────────────────────────────────────

function buildEmailHtml({ name, domain, domainDisplay, appUrl, critical, warning, info, total }) {
  const severityBadge = (label, color, bg) =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:100px;background:${bg};color:${color};font-size:11px;font-weight:700;font-family:monospace;text-transform:uppercase;">${label}</span>`;

  const issueRow = (issue) => {
    const badge = issue.severity === 'critical'
      ? severityBadge('Critical', '#fa6d6d', 'rgba(250,109,109,0.15)')
      : issue.severity === 'warning'
      ? severityBadge('Warning', '#f5a623', 'rgba(245,166,35,0.15)')
      : severityBadge('Info', '#7c6dfa', 'rgba(124,109,250,0.15)');

    const pageUrl = issue.pageUrl
      ? `<div style="font-family:monospace;font-size:11px;color:#6b6b80;margin-top:4px;word-break:break-all;">${issue.pageUrl}</div>`
      : '';

    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2a2a3a;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            ${badge}
            <span style="font-size:13px;font-weight:600;color:#e8e8f0;">${escHtml(issue.title)}</span>
          </div>
          <div style="font-size:12px;color:#9999b0;line-height:1.5;">${escHtml(issue.description || '')}</div>
          ${pageUrl}
        </td>
      </tr>
    `;
  };

  const issueSection = (issues, label) => {
    if (!issues.length) return '';
    return `
      <tr>
        <td style="padding:16px 0 8px;">
          <div style="font-family:monospace;font-size:10px;color:#6b6b80;text-transform:uppercase;letter-spacing:1px;">${label}</div>
        </td>
      </tr>
      ${issues.map(issueRow).join('')}
    `;
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${total} new SEO issues on ${domainDisplay}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Logo / header -->
          <tr>
            <td style="padding-bottom:32px;">
              <div style="font-family:monospace;font-size:18px;font-weight:700;color:#00e5a0;letter-spacing:-0.5px;">
                SEOFix
              </div>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:#111118;border:1px solid #2a2a3a;border-radius:12px;padding:32px;">

              <!-- Greeting -->
              <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#ffffff;">
                Hi ${escHtml(name)},
              </p>
              <p style="margin:0 0 24px;font-size:14px;color:#9999b0;line-height:1.6;">
                Your daily SEO scan found <strong style="color:#e8e8f0;">${total} new issue${total > 1 ? 's' : ''}</strong> on
                <strong style="color:#e8e8f0;">${escHtml(domainDisplay)}</strong> since the last scan.
              </p>

              <!-- Issue list -->
              <table width="100%" cellpadding="0" cellspacing="0">
                ${issueSection(critical, 'Critical')}
                ${issueSection(warning, 'Warnings')}
                ${issueSection(info, 'Info')}
              </table>

              <!-- CTA -->
              <div style="margin-top:28px;padding-top:24px;border-top:1px solid #2a2a3a;text-align:center;">
                <a
                  href="${appUrl}/crawl"
                  style="display:inline-block;padding:12px 28px;background:#00e5a0;color:#0a0a0f;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;"
                >
                  Review and fix issues →
                </a>
                <p style="margin:12px 0 0;font-size:11px;color:#6b6b80;">
                  Or visit <a href="${appUrl}" style="color:#6b6b80;">${appUrl.replace('https://', '')}</a>
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6b6b80;line-height:1.6;">
                You're receiving this because you have an active SEOFix monitoring plan for ${escHtml(domainDisplay)}.<br>
                <a href="${appUrl}/account" style="color:#6b6b80;">Manage notifications</a> ·
                <a href="${appUrl}/account" style="color:#6b6b80;">Cancel subscription</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
