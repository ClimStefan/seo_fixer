/**
 * crawler.js — Full site crawl engine
 *
 * This is the core of the one-time audit product. Given a domain, it:
 * 1. Fetches the homepage and extracts all internal links
 * 2. Follows those links to discover more pages (BFS — breadth first search)
 * 3. Crawls each discovered page using the existing auditUrl logic
 * 4. Aggregates all results into a single site-level report
 *
 * It does NOT use Puppeteer — we use the same fetch-based approach as the
 * free single-page auditor. This works for most static sites, Next.js,
 * WordPress, and server-rendered apps. Puppeteer comes later for the
 * paid monitoring plan where we need to handle heavy JS-rendered SPAs.
 *
 * Key constraints we enforce:
 * - Max pages: 200 (prevents runaway crawls on huge sites)
 * - Concurrency: 3 pages at a time (polite crawling, avoids hammering servers)
 * - Per-page timeout: 10s (same as single-page auditor)
 * - Same domain only: we never follow external links
 * - No duplicate URLs: we track visited URLs in a Set
 */

import { auditUrl } from './audit.js';

// ─────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────

// Maximum pages to crawl per site. 200 is enough for most SaaS/blog sites.
// Large sites (1000+ pages) need the paid plan with background queue.
const MAX_PAGES = 200;

// How many pages to fetch simultaneously. 3 is polite — won't trigger
// rate limiting on most servers while still being reasonably fast.
const CONCURRENCY = 3;

// URL patterns we skip — these are never useful for SEO auditing
const SKIP_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.pdf', '.zip', '.tar', '.gz',
  '.mp4', '.mp3', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.css', '.js', '.json', '.xml',
  '.map', '.ts',
]);

// URL patterns to skip by path prefix
const SKIP_PATHS = [
  '/cdn-cgi/',   // Cloudflare internals
  '/wp-json/',   // WordPress REST API
  '/api/',       // API endpoints
  '/_next/',     // Next.js internals
  '/static/',    // Static asset folders
  '/.well-known/',
];

// ─────────────────────────────────────────
// URL UTILITIES
// ─────────────────────────────────────────

/**
 * Normalizes a URL for deduplication.
 * Strips trailing slashes, lowercases the host, removes fragments (#).
 * We keep query strings because /blog?page=2 is a different page than /blog.
 * However, we strip utm_ and other tracking params that don't affect content.
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);

    // Remove fragment — #section anchors are not separate pages
    u.hash = '';

    // Remove tracking params that don't change page content
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    trackingParams.forEach(p => u.searchParams.delete(p));

    // Lowercase the host (case-insensitive per spec)
    u.hostname = u.hostname.toLowerCase();

    // Remove trailing slash from path UNLESS it's the root "/"
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Checks if a URL belongs to the same domain we're crawling.
 * We treat www.example.com and example.com as the same domain.
 */
function isSameDomain(url, baseDomain) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const base = baseDomain.toLowerCase().replace(/^www\./, '');
    return host === base || host.endsWith('.' + base);
  } catch {
    return false;
  }
}

/**
 * Returns true if we should skip this URL entirely.
 * Checks file extension and path prefix.
 */
function shouldSkipUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();

    // Skip by extension
    const ext = path.substring(path.lastIndexOf('.'));
    if (SKIP_EXTENSIONS.has(ext)) return true;

    // Skip by path prefix
    if (SKIP_PATHS.some(prefix => path.startsWith(prefix))) return true;

    // Skip mailto:, tel:, javascript: etc
    if (!url.startsWith('http://') && !url.startsWith('https://')) return true;

    return false;
  } catch {
    return true; // if URL is unparseable, skip it
  }
}

/**
 * Extracts all internal links from an HTML page.
 * Finds every <a href="..."> and resolves relative URLs against the base URL.
 * Returns an array of absolute, normalized URLs on the same domain.
 */
function extractInternalLinks(html, pageUrl, baseDomain) {
  const links = new Set();

  // Match all href attributes in anchor tags
  // This regex handles href="...", href='...', and is case-insensitive
  const hrefRegex = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    let href = match[1].trim();

    // Skip empty, anchor-only, or javascript: links
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }

    try {
      // Resolve relative URLs (e.g. "/about" or "../pricing") against the page URL
      const absoluteUrl = new URL(href, pageUrl).toString();
      const normalized = normalizeUrl(absoluteUrl);

      // Only keep links to the same domain
      if (isSameDomain(normalized, baseDomain) && !shouldSkipUrl(normalized)) {
        links.add(normalized);
      }
    } catch {
      // Malformed URL — skip it
    }
  }

  return Array.from(links);
}

// ─────────────────────────────────────────
// CONCURRENCY HELPER
// ─────────────────────────────────────────

/**
 * Runs an array of async tasks with a concurrency limit.
 * Instead of Promise.all() which fires everything at once,
 * this processes N tasks at a time, starting the next one
 * as soon as one finishes.
 *
 * Example: 50 pages with concurrency 3 runs 3 at a time,
 * so at any moment max 3 fetches are in-flight.
 *
 * @param {Array} items — the list of things to process
 * @param {number} limit — max concurrent tasks
 * @param {Function} fn — async function(item) => result
 * @returns {Array} results in the same order as items
 */
async function runWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await fn(items[current]);
      } catch (err) {
        // Individual page failure — store error, don't crash whole crawl
        results[current] = { error: err.message };
      }
    }
  }

  // Spin up N workers simultaneously
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);

  return results;
}

// ─────────────────────────────────────────
// LINK DISCOVERY (BFS)
// ─────────────────────────────────────────

/**
 * Crawls a site breadth-first to discover all internal URLs.
 * Starts at the homepage, extracts links, adds new ones to the queue,
 * then fetches those pages and extracts more links, and so on.
 *
 * We stop when we've discovered MAX_PAGES URLs or the queue is empty.
 * We track which URLs we've already seen to avoid duplicates.
 *
 * Returns an array of discovered URLs (not yet audited — just the URL list).
 *
 * @param {string} startUrl — the homepage URL to start from
 * @param {string} baseDomain — the domain we're allowed to crawl
 * @param {Function} onProgress — callback(discovered, queued) for UI updates
 */
async function discoverUrls(startUrl, baseDomain, onProgress) {
  const visited = new Set();   // URLs we've already fetched for link extraction
  const discovered = new Set(); // All unique URLs found (the final list to audit)
  const queue = [startUrl];    // BFS queue — URLs waiting to be link-extracted

  discovered.add(normalizeUrl(startUrl));

  // Process the queue level by level (BFS)
  // We stop when queue is empty OR we've hit the page limit
  while (queue.length > 0 && discovered.size < MAX_PAGES) {
    // Take up to CONCURRENCY items from the front of the queue
    const batch = queue.splice(0, CONCURRENCY);

    // Fetch all pages in this batch simultaneously
    const fetches = await Promise.allSettled(
      batch.map(async (url) => {
        if (visited.has(url)) return { url, links: [] };
        visited.add(url);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SEOFix/1.0; +https://seofix.io/bot)',
              Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
          });

          clearTimeout(timeout);

          // Only parse HTML responses — skip redirects to external domains
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html')) return { url, links: [] };
          if (!isSameDomain(response.url, baseDomain)) return { url, links: [] };

          const html = await response.text();
          const links = extractInternalLinks(html, response.url, baseDomain);

          return { url, links };
        } catch {
          return { url, links: [] };
        }
      })
    );

    // Process discovered links — add new ones to the queue
    for (const result of fetches) {
      if (result.status === 'fulfilled') {
        const { links } = result.value;
        for (const link of links) {
          if (!discovered.has(link) && discovered.size < MAX_PAGES) {
            discovered.add(link);
            queue.push(link);
          }
        }
      }
    }

    // Report progress to the UI
    if (onProgress) {
      onProgress(discovered.size, queue.length);
    }
  }

  return Array.from(discovered);
}

// ─────────────────────────────────────────
// SITE-LEVEL AGGREGATION
// ─────────────────────────────────────────

/**
 * Calculates an overall site SEO score from all page scores.
 * Uses a weighted average — pages with more issues drag the score down more.
 * Also computes site-level issue counts across all pages.
 */
function aggregateSiteResults(pageResults) {
  const successfulPages = pageResults.filter(p => !p.error);

  if (successfulPages.length === 0) {
    return { siteScore: 0, siteCounts: { critical: 0, warning: 0, info: 0, total: 0 } };
  }

  // Simple average of all page scores
  const siteScore = Math.round(
    successfulPages.reduce((sum, p) => sum + p.score, 0) / successfulPages.length
  );

  // Aggregate counts across all pages
  const siteCounts = successfulPages.reduce(
    (acc, p) => ({
      critical: acc.critical + p.counts.critical,
      warning: acc.warning + p.counts.warning,
      info: acc.info + p.counts.info,
      total: acc.total + p.counts.total,
    }),
    { critical: 0, warning: 0, info: 0, total: 0 }
  );

  // Pages by health status
  const healthBreakdown = {
    healthy: successfulPages.filter(p => p.score >= 80).length,
    needsWork: successfulPages.filter(p => p.score >= 50 && p.score < 80).length,
    poor: successfulPages.filter(p => p.score < 50).length,
  };

  // Most common issue types across the site
  const issueFrequency = {};
  for (const page of successfulPages) {
    for (const issue of page.issues) {
      issueFrequency[issue.type] = (issueFrequency[issue.type] || 0) + 1;
    }
  }

  // Sort by frequency — most common issues first
  const topIssues = Object.entries(issueFrequency)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  return { siteScore, siteCounts, healthBreakdown, topIssues };
}

// ─────────────────────────────────────────
// MAIN CRAWL FUNCTION
// ─────────────────────────────────────────

/**
 * crawlSite — the main export. This is what the API route calls.
 *
 * Full flow:
 * 1. Validate and normalize the start URL
 * 2. Discover all internal URLs via BFS link following
 * 3. Audit each discovered URL using the existing auditUrl() function
 * 4. Aggregate results into a site-level report
 *
 * The onProgress callback is called throughout so the UI can show
 * a live progress update while the crawl runs.
 *
 * @param {string} rawUrl — the URL entered by the user (e.g. "example.com")
 * @param {Function} onProgress — optional callback(phase, current, total, message)
 * @returns {Object} full crawl report
 */
export async function crawlSite(rawUrl, onProgress) {
  // ── Step 1: Normalize the start URL ──
  let startUrl = rawUrl.trim();
  if (!startUrl.startsWith('http://') && !startUrl.startsWith('https://')) {
    startUrl = 'https://' + startUrl;
  }

  // Extract base domain for same-domain checking
  let baseDomain;
  try {
    baseDomain = new URL(startUrl).hostname;
  } catch {
    return { error: 'Invalid URL. Please enter a valid website address.' };
  }

  // ── Step 2: Verify the site is reachable before starting the full crawl ──
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const testFetch = await fetch(startUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOFix/1.0; +https://seofix.io/bot)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!testFetch.ok) {
      return {
        error: `The site returned an HTTP ${testFetch.status} error. Make sure the URL is correct and the site is publicly accessible.`,
      };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'The site took too long to respond. Make sure it is online and publicly accessible.' };
    }
    return { error: `Could not reach the site. (${err.message})` };
  }

  // ── Step 3: Discover all internal URLs ──
  if (onProgress) onProgress('discovering', 0, 0, 'Discovering pages...');

  let allUrls;
  try {
    allUrls = await discoverUrls(
      normalizeUrl(startUrl),
      baseDomain,
      (discovered, queued) => {
        if (onProgress) {
          onProgress('discovering', discovered, queued, `Found ${discovered} pages...`);
        }
      }
    );
  } catch (err) {
    return { error: `Failed to discover pages on the site. (${err.message})` };
  }

  if (allUrls.length === 0) {
    return { error: 'No pages found to crawl. The site may be blocking crawlers or have no internal links.' };
  }

  // ── Step 4: Audit each discovered URL ──
  if (onProgress) onProgress('auditing', 0, allUrls.length, `Auditing ${allUrls.length} pages...`);

  let auditedCount = 0;

  const pageResults = await runWithConcurrency(allUrls, CONCURRENCY, async (url) => {
    const result = await auditUrl(url);
    auditedCount++;

    if (onProgress) {
      onProgress('auditing', auditedCount, allUrls.length, `Audited ${auditedCount} of ${allUrls.length} pages...`);
    }

    // Add the URL to the result so we can display it in the UI
    return { ...result, url };
  });

  // ── Step 5: Separate successful audits from failed ones ──
  const successfulPages = pageResults.filter(p => p && !p.error);
  const failedPages = pageResults
    .map((p, i) => ({ ...p, url: allUrls[i] }))
    .filter(p => p.error);

  // ── Step 6: Aggregate site-level stats ──
  const { siteScore, siteCounts, healthBreakdown, topIssues } = aggregateSiteResults(successfulPages);

  // Sort pages: most issues first (most critical pages at the top)
  const sortedPages = [...successfulPages].sort((a, b) => {
    // First by critical count descending
    if (b.counts.critical !== a.counts.critical) return b.counts.critical - a.counts.critical;
    // Then by total issues descending
    return b.counts.total - a.counts.total;
  });

  return {
    // Site-level summary
    domain: baseDomain,
    startUrl,
    crawledAt: new Date().toISOString(),
    totalPages: allUrls.length,
    successfulPages: successfulPages.length,
    failedPages: failedPages.length,

    // Scores and counts
    siteScore,
    siteCounts,
    healthBreakdown,
    topIssues,

    // Per-page results sorted by severity
    pages: sortedPages,

    // Pages that failed to load (404s, timeouts, etc.)
    errors: failedPages.map(p => ({ url: p.url, error: p.error })),

    // Whether we hit the page limit
    hitPageLimit: allUrls.length >= MAX_PAGES,
    pageLimit: MAX_PAGES,
  };
}
