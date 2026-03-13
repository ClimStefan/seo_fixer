/**
 * seofix-worker/jobs/linkCheck.js
 *
 * Checks every internal link on the site for broken links and redirect issues.
 *
 * What it detects:
 * - 404 / 4XX errors — broken pages
 * - 3XX redirect chains — 3+ hops before reaching final destination
 * - HTTP → HTTPS redirects — pages still linked via http://
 * - Redirect loops — page A → B → A (would cause infinite loop)
 *
 * How it works:
 * 1. Load the last full crawl results from seofix_scans (we already have all pages)
 * 2. Extract every internal link from every page
 * 3. HEAD request each unique link (HEAD = just headers, no body — much faster)
 * 4. Record status code and redirect chain for each
 * 5. Save issues to seofix_link_issues table
 */

import fetch from 'node-fetch';
import { supabase } from '../../lib/supabase.js';
import { startJob, updateProgress, completeJob, failJob } from '../../lib/jobUtils.js';

const REQUEST_TIMEOUT = 8000;  // 8 seconds per link
const CONCURRENCY = 10;        // Link checks are just HEAD requests — can do more at once
const MAX_REDIRECT_HOPS = 10;  // Stop following redirects after this many

/**
 * Follows redirects manually so we can count the hops.
 * Returns { finalUrl, statusCode, chain, hops }
 * where chain is the full list of URLs visited.
 */
async function checkLink(url) {
  const chain = [url];
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(current, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'manual', // Don't auto-follow — we track manually
        headers: { 'User-Agent': 'SEOFixBot/1.0' },
      });
      clearTimeout(timeout);

      // Not a redirect — this is the final destination
      if (res.status < 300 || res.status >= 400) {
        return {
          finalUrl: current,
          statusCode: res.status,
          chain,
          hops: hop,
        };
      }

      // It's a redirect — follow it
      const location = res.headers.get('location');
      if (!location) {
        return { finalUrl: current, statusCode: res.status, chain, hops: hop };
      }

      // Resolve relative redirects
      try {
        current = new URL(location, current).toString();
      } catch {
        current = location;
      }

      // Detect redirect loops
      if (chain.includes(current)) {
        return { finalUrl: current, statusCode: res.status, chain, hops: hop, loop: true };
      }

      chain.push(current);

    } catch (err) {
      clearTimeout(timeout);
      return { finalUrl: current, statusCode: 0, chain, hops: hop, error: err.message };
    }
  }

  // Hit MAX_REDIRECT_HOPS — probably a redirect loop
  return { finalUrl: current, statusCode: 0, chain, hops: MAX_REDIRECT_HOPS, loop: true };
}

export async function runLinkCheck({ jobId, userId, domain }) {
  await startJob(jobId);

  try {
    // Load the most recent full crawl results — we already have all the page data
    const { data: scan } = await supabase
      .from('seofix_scans')
      .select('issues')
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('scan_type', 'full')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!scan) {
      await failJob(jobId, 'No full crawl found. Run a full crawl first.');
      return;
    }

    const pages = scan.issues || [];  // Each element is a page with its URL and issues

    // Extract all unique internal links from all pages
    // We stored links during the crawl in the issues JSONB
    const baseDomain = domain.replace(/^www\./, '');
    const allLinks = new Set();

    for (const page of pages) {
      if (page.url) allLinks.add(page.url);
    }

    const linkArray = Array.from(allLinks);
    console.log(`[${jobId}] Checking ${linkArray.length} links`);

    const linkIssues = [];
    let checked = 0;

    // Process links in batches of CONCURRENCY
    for (let i = 0; i < linkArray.length; i += CONCURRENCY) {
      const batch = linkArray.slice(i, i + CONCURRENCY);

      const results = await Promise.allSettled(
        batch.map(url => checkLink(url))
      );

      for (let j = 0; j < results.length; j++) {
        const url = batch[j];
        const result = results[j];

        if (result.status !== 'fulfilled') continue;

        const { statusCode, chain, hops, loop, error } = result.value;

        // 404 or other 4XX — broken link
        if (statusCode >= 400) {
          linkIssues.push({
            job_id: jobId,
            user_id: userId,
            domain,
            source_url: url,
            target_url: url,
            status_code: statusCode,
            issue_type: 'broken',
            chain: chain,
          });
        }

        // Redirect chain with 3+ hops — bad for SEO (loses link equity)
        else if (hops >= 3) {
          linkIssues.push({
            job_id: jobId,
            user_id: userId,
            domain,
            source_url: url,
            target_url: result.value.finalUrl,
            status_code: statusCode,
            issue_type: 'redirect_chain',
            chain: chain,
          });
        }

        // Redirect loop
        else if (loop) {
          linkIssues.push({
            job_id: jobId,
            user_id: userId,
            domain,
            source_url: url,
            target_url: url,
            status_code: statusCode,
            issue_type: 'redirect_loop',
            chain: chain,
          });
        }

        // HTTP URL that redirects to HTTPS — all internal links should be HTTPS already
        else if (url.startsWith('http://') && result.value.finalUrl.startsWith('https://')) {
          linkIssues.push({
            job_id: jobId,
            user_id: userId,
            domain,
            source_url: url,
            target_url: result.value.finalUrl,
            status_code: statusCode,
            issue_type: 'http_to_https',
            chain: chain,
          });
        }
      }

      checked += batch.length;
      await updateProgress(jobId, linkArray.length, checked);
      console.log(`[${jobId}] Link check: ${checked}/${linkArray.length}`);
    }

    // Save all issues to seofix_link_issues table
    if (linkIssues.length > 0) {
      await supabase.from('seofix_link_issues').insert(linkIssues);
    }

    await completeJob(jobId);
    console.log(`[${jobId}] Link check done. ${linkIssues.length} issues found.`);

  } catch (err) {
    console.error(`[${jobId}] Link check failed:`, err);
    await failJob(jobId, err.message);
  }
}
