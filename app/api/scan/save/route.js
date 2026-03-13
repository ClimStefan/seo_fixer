/**
 * app/api/scan/save/route.js
 *
 * Called by the crawl page when a full site crawl finishes.
 * Saves the crawl results AND builds fingerprints for all crawled pages.
 * This is what gives the cron job its baseline to diff against.
 *
 * The crawl page already has all the page HTML in memory during the crawl.
 * It passes the pages array here so we can fingerprint them server-side.
 *
 * POST body:
 *   domain    — e.g. "https://yoursite.com"
 *   issues    — flat array of all issues (each has a pageUrl field)
 *   score     — overall score
 *   pages     — array of { url, html } — the raw crawled pages
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';
import { buildFingerprintMap } from '../../../../lib/fingerprint.js';

export async function POST(request) {
const authObject = await auth();
const userId = authObject.userId;
if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { domain, issues, score, pages } = body;

  if (!domain || !pages?.length) {
    return NextResponse.json({ error: 'Missing domain or pages.' }, { status: 400 });
  }

  // Build fingerprint map from the crawled pages
  // pages = [{ url, html }, ...] — html is the raw HTML string
  const fingerprints = buildFingerprintMap(pages);

  const { data, error } = await supabase
    .from('seofix_scans')
    .insert({
      user_id: userId,
      domain,
      scan_type: 'full',
      score: score ?? 0,
      page_count: pages.length,
      issue_count: issues?.length ?? 0,
      issues: issues ?? [],
      fingerprints,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[scan/save] Supabase error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, scanId: data.id, pagesFingerprinted: Object.keys(fingerprints).length });
}
