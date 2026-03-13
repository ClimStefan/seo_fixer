/**
 * lib/fingerprint.js
 *
 * SEO content fingerprinting for delta scanning.
 *
 * The idea: instead of re-auditing every page every day, we extract
 * only the SEO-relevant parts of each page into a short string (the
 * "fingerprint"), then hash it. If the hash matches yesterday's hash,
 * the page hasn't changed in any way that matters for SEO — skip it.
 *
 * We deliberately EXCLUDE things that change constantly but don't
 * affect SEO: analytics scripts, cookie banners, timestamps, CSRF
 * tokens, dynamic nav items, etc.
 *
 * What we DO include:
 *   - <title>
 *   - meta description
 *   - canonical URL
 *   - first H1
 *   - robots meta
 *   - html lang attribute
 *   - og:title, og:description
 *   - viewport meta presence (boolean)
 *   - schema presence (boolean)
 *   - image count with missing alt (number)
 *   - approximate word count bucket (0-99, 100-299, 300+)
 *     We use a bucket not exact count so minor copy edits don't
 *     trigger a full re-audit. Only crossing the threshold matters.
 */

// ─────────────────────────────────────────
// FINGERPRINT EXTRACTION
// Pulls SEO signals from raw HTML into a plain string.
// ─────────────────────────────────────────

export function extractFingerprint(html) {
  const get = (pattern) => {
    const m = html.match(pattern);
    return m ? (m[1] || '').trim() : '';
  };

  // Title
  const title = get(/<title[^>]*>([^<]*)<\/title>/i);

  // Meta description — handle both attribute orderings
  const metaDesc = (() => {
    const a = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i);
    const b = html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
    return ((a || b)?.[1] || '').trim();
  })();

  // Canonical
  const canonical = (() => {
    const a = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)/i);
    const b = html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["']/i);
    return ((a || b)?.[1] || '').trim();
  })();

  // First H1 only — strip inner tags
  const h1Raw = get(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Raw.replace(/<[^>]+>/g, '').trim();

  // Robots meta
  const robots = (() => {
    const m = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i);
    return (m?.[1] || '').trim().toLowerCase();
  })();

  // HTML lang
  const lang = get(/<html[^>]*lang=["']([^"']*)/i).toLowerCase();

  // OG tags
  const ogTitle = (() => {
    const m = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)/i);
    return (m?.[1] || '').trim();
  })();
  const ogDesc = (() => {
    const m = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)/i);
    return (m?.[1] || '').trim();
  })();

  // Viewport — just presence, not exact value
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html) ? '1' : '0';

  // Schema — just presence
  const hasSchema = (
    html.includes('application/ld+json') ||
    html.includes('itemtype="http://schema.org')
  ) ? '1' : '0';

  // Images missing alt text — count only (not which ones, counts can shift slightly)
  const imgMatches = [...html.matchAll(/<img([^>]*)>/gi)];
  const missingAltCount = imgMatches.filter(m => {
    const attrs = m[1];
    const hasSrc = /src=["'][^"']+["']/i.test(attrs);
    const hasAlt = /\balt=/i.test(attrs);
    return hasSrc && !hasAlt;
  }).length;

  // Word count bucket — 0=thin(<300), 1=ok(300-999), 2=good(1000+)
  // We bucket so minor copy edits don't trigger re-audits
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const wordCount = text.split(' ').filter(w => w.length > 1).length;
  const wordBucket = wordCount < 300 ? '0' : wordCount < 1000 ? '1' : '2';

  // Build fingerprint string — pipe-separated so it's readable when debugging
  return [
    title,
    metaDesc,
    canonical,
    h1,
    robots,
    lang,
    ogTitle,
    ogDesc,
    hasViewport,
    hasSchema,
    String(missingAltCount),
    wordBucket,
  ].join('|');
}

// ─────────────────────────────────────────
// SIMPLE HASH
// Turns the fingerprint string into a short numeric hash.
// Not cryptographic — just fast and good enough for change detection.
// Uses djb2 algorithm: hash = hash * 33 + charCode for each char.
// ─────────────────────────────────────────

export function hashFingerprint(fingerprint) {
  let hash = 5381;
  for (let i = 0; i < fingerprint.length; i++) {
    hash = ((hash << 5) + hash) + fingerprint.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Return as unsigned hex string — e.g. "a3f2c1b8"
  return (hash >>> 0).toString(16);
}

// ─────────────────────────────────────────
// BUILD FINGERPRINT MAP
// Takes an array of { url, html } objects and returns
// { url → hash } for storage in seofix_scans.fingerprints
// ─────────────────────────────────────────

export function buildFingerprintMap(pages) {
  const map = {};
  for (const { url, html } of pages) {
    try {
      const fingerprint = extractFingerprint(html);
      map[url] = hashFingerprint(fingerprint);
    } catch {
      // If a page fails to parse, store empty string — it will
      // always appear "changed" and get re-audited, which is safe
      map[url] = '';
    }
  }
  return map;
}

// ─────────────────────────────────────────
// DELTA COMPARISON
// Compares current fingerprints to stored ones.
// Returns three arrays:
//   changed — URLs that need re-auditing
//   unchanged — URLs that can be skipped
//   newUrls — URLs not in the previous scan (new pages)
// ─────────────────────────────────────────

export function compareFingerprintMaps(currentMap, storedMap) {
  const changed = [];
  const unchanged = [];
  const newUrls = [];

  for (const [url, currentHash] of Object.entries(currentMap)) {
    if (!(url in storedMap)) {
      // Page wasn't in the last scan — treat as new, must audit
      newUrls.push(url);
    } else if (storedMap[url] === '' || currentHash === '') {
      // Empty hash means we couldn't parse it — re-audit to be safe
      changed.push(url);
    } else if (currentHash !== storedMap[url]) {
      changed.push(url);
    } else {
      unchanged.push(url);
    }
  }

  return { changed, unchanged, newUrls };
}

// ─────────────────────────────────────────
// FETCH PAGE FOR FINGERPRINTING
// Lightweight fetch — we only need the HTML, no heavy processing.
// 8 second timeout so slow pages don't hang the cron.
// ─────────────────────────────────────────

export async function fetchPageForFingerprint(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEOFix-Monitor/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!res.ok) return { url, html: null, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { url, html };
  } catch (err) {
    clearTimeout(timeout);
    return { url, html: null, error: err.message };
  }
}

// ─────────────────────────────────────────
// BATCH FETCH WITH CONCURRENCY LIMIT
// Fetches multiple pages in parallel but caps at maxConcurrent
// to avoid hammering the user's server or Vercel limits.
// ─────────────────────────────────────────

export async function batchFetchPages(urls, maxConcurrent = 5) {
  const results = [];

  // Process in chunks of maxConcurrent
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const chunk = urls.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.all(
      chunk.map(url => fetchPageForFingerprint(url))
    );
    results.push(...chunkResults);
  }

  return results;
}
