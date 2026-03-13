/**
 * seofix-worker/jobs/fullCrawl.js
 *
 * Crawls an entire website page by page, auditing each one for SEO issues.
 * This runs on Railway so it can take as long as needed — no Vercel timeout.
 *
 * Flow:
 * 1. Start from the homepage, discover all internal links
 * 2. Fetch and audit each page (title, meta, H1, OG tags, etc.)
 * 3. Save results to seofix_scans and seofix_jobs in Supabase
 * 4. Update progress counter after each page so frontend can poll it
 */

import { supabase } from '../lib/supabase.js';
import { startJob, updateProgress, completeJob, failJob } from '../lib/jobUtils.js';
import { parse } from 'node-html-parser';
import fetch from 'node-fetch';

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

const MAX_PAGES = 500;       // Hard cap — prevents runaway crawls
const CONCURRENCY = 3;       // Pages fetched simultaneously — polite to target server
const REQUEST_TIMEOUT = 10000; // 10 seconds per page fetch

// File extensions that are never web pages — skip these links
const SKIP_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz', '.mp4', '.mp3', '.wav',
  '.woff', '.woff2', '.ttf', '.eot', '.css', '.js', '.json',
  '.xml', '.map', '.ts',
]);

// URL path prefixes that are never useful for SEO auditing
const SKIP_PATHS = [
  '/api/', '/_next/', '/static/', '/cdn-cgi/', '/wp-json/',
  '/login', '/signin', '/sign-in', '/signup', '/sign-up',
  '/register', '/logout', '/auth/', '/dashboard', '/account',
  '/profile', '/settings', '/admin', '/app/',
  '/privacy', '/cookie', '/terms', '/legal', '/gdpr',
];

// ─────────────────────────────────────────
// URL UTILITIES
// ─────────────────────────────────────────

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // Strip tracking params
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid']
      .forEach(p => u.searchParams.delete(p));
    u.hostname = u.hostname.toLowerCase();
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function isSameDomain(url, baseDomain) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const base = baseDomain.toLowerCase().replace(/^www\./, '');
    return host === base || host.endsWith('.' + base);
  } catch {
    return false;
  }
}

function shouldSkipUrl(url) {
  try {
    const u = new URL(url);
    const ext = u.pathname.slice(u.pathname.lastIndexOf('.')).toLowerCase();
    if (SKIP_EXTENSIONS.has(ext)) return true;
    const path = u.pathname.toLowerCase();
    if (SKIP_PATHS.some(p => path.startsWith(p))) return true;
    return false;
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────
// PAGE FETCHER
// ─────────────────────────────────────────

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SEOFixBot/1.0 (+https://seofix.app)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    const html = await res.text();
    return { ok: res.ok, status: res.status, html, finalUrl: res.url };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─────────────────────────────────────────
// HTML PARSER — extracts SEO signals
// ─────────────────────────────────────────

function parsePage(html, url) {
  const root = parse(html);

  const title = root.querySelector('title')?.text?.trim() || null;
  const metaDesc = root.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null;
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() || null;
  const h1 = root.querySelector('h1')?.text?.trim() || null;
  const robotsMeta = root.querySelector('meta[name="robots"]')?.getAttribute('content')?.toLowerCase() || null;
  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || null;
  const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || null;
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() || null;
  const twitterCard = root.querySelector('meta[name="twitter:card"]')?.getAttribute('content')?.trim() || null;
  const lang = root.querySelector('html')?.getAttribute('lang')?.trim() || null;
  const viewport = root.querySelector('meta[name="viewport"]') ? true : false;

  // Count images missing alt text
  const images = root.querySelectorAll('img');
  const missingAlt = images.filter(img => !img.getAttribute('alt')?.trim()).length;

  // Extract all internal links for crawl queue
  const links = root.querySelectorAll('a[href]')
    .map(a => a.getAttribute('href'))
    .filter(Boolean)
    .map(href => {
      try {
        return new URL(href, url).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Word count from body text
  const bodyText = root.querySelector('body')?.text || '';
  const wordCount = bodyText.trim().split(/\s+/).filter(w => w.length > 0).length;

  return {
    title, metaDesc, canonical, h1, robotsMeta,
    ogTitle, ogDesc, ogImage, twitterCard,
    lang, viewport, missingAlt, links, wordCount,
  };
}

// ─────────────────────────────────────────
// ISSUE DETECTOR — same logic as audit.js but returns array
// ─────────────────────────────────────────

function detectIssues(parsed, url, finalUrl) {
  const issues = [];

  // Noindex check — do this first, it's the most important
  if (parsed.robotsMeta && (parsed.robotsMeta.includes('noindex') || parsed.robotsMeta.includes('none'))) {
    issues.push({
      type: 'noindex_set', severity: 'warning',
      title: 'Page is set to noindex',
      description: `robots meta is "${parsed.robotsMeta}" — this page won't appear in search results.`,
      currentValue: parsed.robotsMeta,
      canAutoFix: false,
    });
  }

  // Title checks
  if (!parsed.title) {
    issues.push({ type: 'missing_title', severity: 'critical', title: 'Missing title tag', description: 'No <title> tag found.', currentValue: null, canAutoFix: true });
  } else if (parsed.title.length > 60) {
    issues.push({ type: 'title_too_long', severity: 'warning', title: `Title too long (${parsed.title.length} chars)`, description: 'Title exceeds 60 characters and will be truncated in search results.', currentValue: parsed.title, canAutoFix: true });
  } else if (parsed.title.length < 30) {
    issues.push({ type: 'title_too_short', severity: 'warning', title: `Title too short (${parsed.title.length} chars)`, description: 'Title is under 30 characters — too brief to rank well.', currentValue: parsed.title, canAutoFix: true });
  }

  // Meta description checks
  if (!parsed.metaDesc) {
    issues.push({ type: 'missing_meta_description', severity: 'critical', title: 'Missing meta description', description: 'No meta description found.', currentValue: null, canAutoFix: true });
  } else if (parsed.metaDesc.length > 160) {
    issues.push({ type: 'meta_description_too_long', severity: 'warning', title: `Meta description too long (${parsed.metaDesc.length} chars)`, description: 'Meta description will be cut off in search results.', currentValue: parsed.metaDesc, canAutoFix: true });
  }

  // H1 check
  if (!parsed.h1) {
    issues.push({ type: 'missing_h1', severity: 'critical', title: 'Missing H1 tag', description: 'No H1 heading found on this page.', currentValue: null, canAutoFix: true });
  }

  // Canonical check
  if (!parsed.canonical) {
    issues.push({ type: 'missing_canonical', severity: 'critical', title: 'Missing canonical tag', description: 'No canonical link tag found.', currentValue: null, canAutoFix: true });
  }

  // Open Graph checks
  const missingOg = [];
  if (!parsed.ogTitle) missingOg.push('og:title');
  if (!parsed.ogDesc) missingOg.push('og:description');
  if (!parsed.ogImage) missingOg.push('og:image');
  if (missingOg.length > 0) {
    issues.push({ type: 'missing_og_tags', severity: 'info', title: `Missing Open Graph tags: ${missingOg.join(', ')}`, description: 'Open Graph tags control how the page looks when shared on social media.', currentValue: null, canAutoFix: true });
  }

  // Twitter card check
  if (!parsed.twitterCard) {
    issues.push({ type: 'missing_twitter_card', severity: 'info', title: 'Missing Twitter card', description: 'No twitter:card meta tag found.', currentValue: null, canAutoFix: true });
  }

  // Alt text check
  if (parsed.missingAlt > 0) {
    issues.push({ type: 'missing_alt_text', severity: 'warning', title: `${parsed.missingAlt} image(s) missing alt text`, description: 'Images without alt text hurt accessibility and image SEO.', currentValue: `${parsed.missingAlt} images`, canAutoFix: true });
  }

  // Viewport check
  if (!parsed.viewport) {
    issues.push({ type: 'missing_viewport', severity: 'warning', title: 'Missing viewport meta tag', description: 'No viewport tag — page may not be mobile-friendly.', currentValue: null, canAutoFix: true });
  }

  // Lang check
  if (!parsed.lang) {
    issues.push({ type: 'missing_lang', severity: 'info', title: 'Missing HTML lang attribute', description: 'The <html> tag has no lang attribute.', currentValue: null, canAutoFix: true });
  }

  return issues;
}

// ─────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────

function scoreIssues(issues) {
  const deductions = { critical: 20, warning: 10, info: 5 };
  return Math.max(0, 100 - issues.reduce((sum, i) => sum + (deductions[i.severity] || 0), 0));
}

// ─────────────────────────────────────────
// MAIN CRAWL FUNCTION
// ─────────────────────────────────────────

export async function runFullCrawl({ jobId, userId, domain, siteId }) {
  await startJob(jobId);

  // Normalize the domain to a proper URL
  let baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  baseUrl = baseUrl.replace(/\/$/, '');
  const baseDomain = new URL(baseUrl).hostname;

  const visited = new Set();         // URLs we've already crawled
  const queue = [normalizeUrl(baseUrl)]; // Start from homepage
  const allPages = [];               // Results accumulator

  console.log(`[${jobId}] Starting crawl of ${baseUrl}`);

  try {
    while (queue.length > 0 && visited.size < MAX_PAGES) {
      // Take up to CONCURRENCY pages from the queue at once
      const batch = [];
      while (batch.length < CONCURRENCY && queue.length > 0) {
        const url = queue.shift();
        if (!url || visited.has(url)) continue;
        if (shouldSkipUrl(url)) continue;
        if (!isSameDomain(url, baseDomain)) continue;
        visited.add(url);
        batch.push(url);
      }

      if (batch.length === 0) continue;

      // Fetch all pages in this batch simultaneously
      const results = await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const fetched = await fetchPage(url);
            if (!fetched.ok) return { url, error: `HTTP ${fetched.status}` };

            const parsed = parsePage(fetched.html, url);
            const issues = detectIssues(parsed, url, fetched.finalUrl);
            const score = scoreIssues(issues);

            // Add newly discovered links to the queue
            for (const link of parsed.links) {
              const normalized = normalizeUrl(link);
              if (!visited.has(normalized) && !queue.includes(normalized)) {
                queue.push(normalized);
              }
            }

            return {
              url,
              finalUrl: fetched.finalUrl,
              score,
              issues,
              meta: {
                title: parsed.title,
                metaDesc: parsed.metaDesc,
                h1: parsed.h1,
                wordCount: parsed.wordCount,
              },
            };
          } catch (err) {
            return { url, error: err.message };
          }
        })
      );

      // Collect successful results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value && !result.value.error) {
          allPages.push(result.value);
        }
      }

      // Update progress in Supabase after each batch
      // Frontend polls this to show "Crawling... 47/200 pages"
      await updateProgress(jobId, visited.size + queue.length, allPages.length);

      console.log(`[${jobId}] Crawled ${allPages.length} pages, ${queue.length} in queue`);
    }

    // All pages crawled — save the full results to seofix_scans
    const totalIssues = allPages.reduce((sum, p) => sum + p.issues.length, 0);
    const avgScore = allPages.length > 0
      ? Math.round(allPages.reduce((sum, p) => sum + p.score, 0) / allPages.length)
      : 0;

    await supabase.from('seofix_scans').insert({
      user_id: userId,
      domain,
      scan_type: 'full',
      score: avgScore,
      page_count: allPages.length,
      issue_count: totalIssues,
      issues: allPages,  // Full page-by-page results stored as JSONB
    });

    // Final progress update with exact counts
    await updateProgress(jobId, allPages.length, allPages.length);
    await completeJob(jobId);

    console.log(`[${jobId}] Crawl complete. ${allPages.length} pages, ${totalIssues} issues, avg score ${avgScore}`);

  } catch (err) {
    console.error(`[${jobId}] Crawl failed:`, err);
    await failJob(jobId, err.message);
  }
}
