/**
 * app/api/cron/monitor/route.js
 *
 * Runs daily at 8am UTC via Vercel Cron.
 * For each active monthly subscriber it:
 *
 * 1. Loads the list of URLs from their last full scan
 * 2. Fetches each URL (fast, lightweight)
 * 3. Computes fingerprints and compares to stored ones
 * 4. Only runs the full SEO audit on CHANGED pages
 * 5. Compares new issues to previous issues to find NEW ones
 * 6. If new issues found → sends email via Resend
 * 7. Saves updated fingerprints and scan results
 *
 * Secured with CRON_SECRET so only Vercel can trigger it.
 * Add CRON_SECRET to your Vercel env vars (any random string).
 */

import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase.js';
import { auditUrl } from '../../../../lib/audit.js';
import {
  buildFingerprintMap,
  compareFingerprintMaps,
  batchFetchPages,
} from '../../../../lib/fingerprint.js';
import { sendNewIssuesEmail } from '../../../../lib/email.js';

export const maxDuration = 60; // Vercel max for hobby plan

export async function GET(request) {
  // Verify this is coming from Vercel Cron, not a random visitor
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron/monitor] Starting daily delta scan...');

  // 1. Load all active monthly subscribers
  const { data: purchases, error: purchaseError } = await supabase
    .from('seofix_purchases')
    .select('id, user_id, type, status')
    .eq('type', 'monthly')
    .eq('status', 'active');

  if (purchaseError || !purchases?.length) {
    console.log('[cron/monitor] No active monthly subscribers found.');
    return NextResponse.json({ ok: true, scanned: 0 });
  }

  console.log(`[cron/monitor] Found ${purchases.length} active subscriber(s).`);

  const results = [];

  for (const purchase of purchases) {
    try {
      const result = await scanSubscriber(purchase.user_id);
      results.push({ userId: purchase.user_id, ...result });
    } catch (err) {
      console.error(`[cron/monitor] Error scanning user ${purchase.user_id}:`, err.message);
      results.push({ userId: purchase.user_id, error: err.message });
    }
  }

  console.log('[cron/monitor] Done.', results);
  return NextResponse.json({ ok: true, scanned: results.length, results });
}

// ─────────────────────────────────────────
// SCAN ONE SUBSCRIBER
// ─────────────────────────────────────────

async function scanSubscriber(userId) {
  // 2. Load their most recent scan (has stored URLs + fingerprints)
  const { data: lastScan } = await supabase
    .from('seofix_scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastScan || !lastScan.fingerprints) {
    // No previous scan — can't do delta, skip until they do a full crawl
    console.log(`[cron/monitor] User ${userId} has no previous scan, skipping.`);
    return { skipped: true, reason: 'no_previous_scan' };
  }

  const storedFingerprints = lastScan.fingerprints; // { url: hash }
  const allUrls = Object.keys(storedFingerprints);

  if (!allUrls.length) {
    return { skipped: true, reason: 'no_urls_in_scan' };
  }

  console.log(`[cron/monitor] User ${userId}: checking ${allUrls.length} URLs...`);

  // 3. Fetch all pages in batches of 5 (fast lightweight fetches)
  const fetchedPages = await batchFetchPages(allUrls, 5);

  // 4. Build new fingerprint map from fetched HTML
  const validPages = fetchedPages.filter(p => p.html !== null);
  const currentFingerprints = buildFingerprintMap(validPages);

  // 5. Compare — find only changed pages
  const { changed, unchanged, newUrls } = compareFingerprintMaps(
    currentFingerprints,
    storedFingerprints
  );

  const urlsToAudit = [...changed, ...newUrls];

  console.log(`[cron/monitor] User ${userId}: ${unchanged.length} unchanged, ${urlsToAudit.length} to audit.`);

  if (!urlsToAudit.length) {
    // Nothing changed — update scan date but keep same issues
    await saveScan(userId, lastScan.domain, lastScan.issues || [], currentFingerprints, 'delta', 0);
    return { changed: 0, unchanged: unchanged.length, newIssues: 0 };
  }

  // 6. Run full audit only on changed pages
  const auditResults = await Promise.all(
    urlsToAudit.map(url => auditUrl(url).catch(err => ({ url, error: err.message, issues: [] })))
  );

  // 7. Build updated issue list:
  //    - Keep existing issues for unchanged pages
  //    - Replace with new audit results for changed pages
  const previousIssuesByUrl = groupIssuesByUrl(lastScan.issues || []);
  const updatedIssuesByUrl = { ...previousIssuesByUrl };

  for (const result of auditResults) {
    const url = result.finalUrl || urlsToAudit[auditResults.indexOf(result)];
    updatedIssuesByUrl[url] = (result.issues || []).map(issue => ({
      ...issue,
      pageUrl: url,
    }));
  }

  const allUpdatedIssues = Object.values(updatedIssuesByUrl).flat();

  // 8. Find NEW issues — present in updated but not in previous scan
  const previousIssueIds = new Set(
    (lastScan.issues || []).map(i => `${i.pageUrl}:${i.type}`)
  );

  const newIssues = allUpdatedIssues.filter(issue => {
    const key = `${issue.pageUrl}:${issue.type}`;
    return !previousIssueIds.has(key);
  });

  console.log(`[cron/monitor] User ${userId}: ${newIssues.length} new issue(s) found.`);

  // 9. Save updated scan
  await saveScan(userId, lastScan.domain, allUpdatedIssues, currentFingerprints, 'delta', urlsToAudit.length);

  // 10. Send email if new issues found
  if (newIssues.length > 0) {
    await notifyUser(userId, lastScan.domain, newIssues);
  }

  return {
    changed: changed.length,
    newUrls: newUrls.length,
    unchanged: unchanged.length,
    audited: urlsToAudit.length,
    newIssues: newIssues.length,
    emailSent: newIssues.length > 0,
  };
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function groupIssuesByUrl(issues) {
  // { url: [issue, issue, ...] }
  const map = {};
  for (const issue of issues) {
    const url = issue.pageUrl || 'unknown';
    if (!map[url]) map[url] = [];
    map[url].push(issue);
  }
  return map;
}

async function saveScan(userId, domain, issues, fingerprints, scanType, pagesAudited) {
  const score = issues.length === 0 ? 100 : Math.max(0, 100 - (issues.length * 5));

  await supabase.from('seofix_scans').insert({
    user_id: userId,
    domain,
    scan_type: scanType,
    score,
    page_count: Object.keys(fingerprints).length,
    issue_count: issues.length,
    issues,
    fingerprints,
  });
}

async function notifyUser(userId, domain, newIssues) {
  // Load user email from seofix_users
  const { data: userData } = await supabase
    .from('seofix_users')
    .select('email, name')
    .eq('id', userId)
    .single();

  if (!userData?.email) return;

  try {
    await sendNewIssuesEmail({
      to: userData.email,
      name: userData.name || 'there',
      domain,
      newIssues,
    });
    console.log(`[cron/monitor] Email sent to ${userData.email}`);
  } catch (err) {
    console.error(`[cron/monitor] Failed to send email to ${userData.email}:`, err.message);
  }
}
