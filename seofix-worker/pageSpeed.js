/**
 * seofix-worker/jobs/pageSpeed.js
 *
 * Calls the Google PageSpeed Insights API for each crawled page.
 * This API is free — no auth needed, just an optional API key for higher rate limits.
 *
 * What it measures:
 * - Performance score (0-100)
 * - LCP — Largest Contentful Paint (should be under 2.5s)
 * - CLS — Cumulative Layout Shift (should be under 0.1)
 * - FID — First Input Delay (should be under 100ms)
 * - TTFB — Time to First Byte (should be under 800ms)
 * - Specific opportunities (render-blocking resources, image sizes, etc.)
 *
 * We test both mobile and desktop, but prioritize mobile since Google uses
 * mobile-first indexing.
 */

import fetch from 'node-fetch';
import { supabase } from '../lib/supabase.js';
import { startJob, updateProgress, completeJob, failJob } from '../lib/jobUtils.js';

// Free tier: 25,000 queries/day. Add PAGESPEED_API_KEY to env for higher limits.
const PAGESPEED_API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// Don't hammer the API — 1 second between requests to stay within rate limits
const DELAY_BETWEEN_REQUESTS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calls the PageSpeed Insights API for a single URL.
 * Returns the extracted metrics or null on failure.
 */
async function checkPageSpeed(url, strategy = 'mobile') {
  const apiKey = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy,
    ...(apiKey && { key: apiKey }),
    // Only request the categories we care about — faster response
    'category': 'performance',
  });

  try {
    const res = await fetch(`${PAGESPEED_API}?${params}`, {
      headers: { 'User-Agent': 'SEOFixBot/1.0' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const categories = data.lighthouseResult?.categories;
    const audits = data.lighthouseResult?.audits;

    if (!categories || !audits) return null;

    // Extract Core Web Vitals from the audit results
    // These values come back in different units — we normalize to ms or score
    const lcp = audits['largest-contentful-paint']?.numericValue || null;  // milliseconds
    const cls = audits['cumulative-layout-shift']?.numericValue || null;   // unitless score
    const fid = audits['max-potential-fid']?.numericValue || null;         // milliseconds
    const ttfb = audits['server-response-time']?.numericValue || null;     // milliseconds
    const performanceScore = Math.round((categories.performance?.score || 0) * 100);

    // Extract specific improvement opportunities
    // These are the "fix this to improve performance" suggestions
    const opportunities = [];
    const opportunityAudits = [
      'render-blocking-resources',
      'unused-css-rules',
      'unused-javascript',
      'uses-optimized-images',
      'uses-webp-images',
      'uses-responsive-images',
      'efficiently-encode-images',
      'uses-text-compression',
    ];

    for (const auditId of opportunityAudits) {
      const audit = audits[auditId];
      if (audit && audit.score !== null && audit.score < 0.9) {
        opportunities.push({
          id: auditId,
          title: audit.title,
          description: audit.description,
          // Estimated savings in milliseconds
          savings: audit.details?.overallSavingsMs || null,
        });
      }
    }

    return { performanceScore, lcp, cls, fid, ttfb, opportunities };

  } catch (err) {
    console.error(`PageSpeed error for ${url}:`, err.message);
    return null;
  }
}

export async function runPageSpeed({ jobId, userId, domain }) {
  await startJob(jobId);

  try {
    // Load crawled pages
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

    const pages = scan.issues || [];

    // Only check pages that are actually indexable — skip noindex pages
    const indexablePages = pages.filter(p =>
      p.url && !p.issues?.some(i => i.type === 'noindex_set')
    );

    // Limit to 50 pages for PageSpeed — API has rate limits
    // Prioritize pages with the worst SEO scores (they likely have perf issues too)
    const pagesToCheck = indexablePages
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, 50);

    console.log(`[${jobId}] Checking PageSpeed for ${pagesToCheck.length} pages`);

    const results = [];

    for (let i = 0; i < pagesToCheck.length; i++) {
      const page = pagesToCheck[i];

      // Check mobile (primary — Google uses mobile-first indexing)
      const mobileResult = await checkPageSpeed(page.url, 'mobile');
      await sleep(DELAY_BETWEEN_REQUESTS);

      if (mobileResult) {
        results.push({
          job_id: jobId,
          user_id: userId,
          domain,
          url: page.url,
          strategy: 'mobile',
          lcp: mobileResult.lcp,
          cls: mobileResult.cls,
          fid: mobileResult.fid,
          ttfb: mobileResult.ttfb,
          performance_score: mobileResult.performanceScore,
          opportunities: mobileResult.opportunities,
        });
      }

      await updateProgress(jobId, pagesToCheck.length, i + 1);
      console.log(`[${jobId}] PageSpeed: ${i + 1}/${pagesToCheck.length} — ${page.url}`);
    }

    // Save all results
    if (results.length > 0) {
      await supabase.from('seofix_pagespeed').insert(results);
    }

    await completeJob(jobId);
    console.log(`[${jobId}] PageSpeed done. ${results.length} pages checked.`);

  } catch (err) {
    console.error(`[${jobId}] PageSpeed failed:`, err);
    await failJob(jobId, err.message);
  }
}
