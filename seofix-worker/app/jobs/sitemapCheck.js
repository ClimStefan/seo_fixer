/**
 * seofix-worker/jobs/sitemapCheck.js
 *
 * Fetches and parses the site's sitemap, then cross-references it
 * against the pages we found during the full crawl.
 *
 * What it detects:
 * - Indexable pages missing from sitemap (Google may not find them)
 * - Pages in sitemap that are set to noindex (contradiction — confuses Google)
 * - Sitemap not found at all
 */

import fetch from 'node-fetch';
import { parseStringPromise } from 'xml2js';
import { supabase } from '../../lib/supabase.js';
import { startJob, completeJob, failJob } from '../../lib/jobUtils.js';

/**
 * Tries to fetch a sitemap from common locations.
 * Returns the XML string or null if not found.
 */
async function fetchSitemap(domain) {
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
  const candidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap/sitemap.xml`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'SEOFixBot/1.0' },
      });
      if (res.ok) {
        const text = await res.text();
        if (text.includes('<urlset') || text.includes('<sitemapindex')) {
          return { url, xml: text };
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Parses a sitemap XML and returns all URLs.
 * Handles both regular sitemaps (<urlset>) and sitemap indexes (<sitemapindex>).
 * For sitemap indexes, fetches each child sitemap and combines them.
 */
async function extractUrlsFromSitemap(xml, baseUrl) {
  const urls = new Set();

  try {
    const parsed = await parseStringPromise(xml);

    // Regular sitemap — <urlset><url><loc>...</loc></url></urlset>
    if (parsed.urlset?.url) {
      for (const entry of parsed.urlset.url) {
        const loc = entry.loc?.[0];
        if (loc) urls.add(loc.trim());
      }
    }

    // Sitemap index — <sitemapindex><sitemap><loc>...</loc></sitemap></sitemapindex>
    // Fetch each child sitemap and extract its URLs too
    if (parsed.sitemapindex?.sitemap) {
      for (const sitemap of parsed.sitemapindex.sitemap) {
        const loc = sitemap.loc?.[0];
        if (!loc) continue;
        try {
          const res = await fetch(loc.trim(), { headers: { 'User-Agent': 'SEOFixBot/1.0' } });
          if (res.ok) {
            const childXml = await res.text();
            const childUrls = await extractUrlsFromSitemap(childXml, baseUrl);
            childUrls.forEach(u => urls.add(u));
          }
        } catch {
          continue;
        }
      }
    }
  } catch (err) {
    console.error('Sitemap parse error:', err.message);
  }

  return urls;
}

export async function runSitemapCheck({ jobId, userId, domain }) {
  await startJob(jobId);

  try {
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    // Try to fetch the sitemap
    const sitemapResult = await fetchSitemap(baseUrl);

    if (!sitemapResult) {
      // No sitemap found at all — that's itself an issue
      await supabase.from('seofix_sitemap_issues').insert({
        job_id: jobId,
        user_id: userId,
        domain,
        url: baseUrl,
        issue_type: 'no_sitemap',
      });
      await completeJob(jobId);
      return;
    }

    // Parse all URLs from the sitemap
    const sitemapUrls = await extractUrlsFromSitemap(sitemapResult.xml, baseUrl);
    console.log(`[${jobId}] Sitemap has ${sitemapUrls.size} URLs`);

    // Load the crawl results — these are the pages we actually found
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

    const crawledPages = scan.issues || [];
    const issues = [];

    // Normalize a URL for comparison — strip trailing slashes, lowercase
    function norm(url) {
      try {
        const u = new URL(url);
        u.hash = '';
        if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
          u.pathname = u.pathname.slice(0, -1);
        }
        return u.toString().toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    }

    const normalizedSitemapUrls = new Set([...sitemapUrls].map(norm));

    // Check 1: Crawled pages that are indexable but missing from sitemap
    for (const page of crawledPages) {
      if (!page.url) continue;

      // Check if this page has a noindex issue (meaning it's intentionally not indexed)
      const hasNoindex = page.issues?.some(i => i.type === 'noindex_set');
      if (hasNoindex) continue; // Skip noindex pages — they shouldn't be in sitemap anyway

      const normalizedUrl = norm(page.url);
      if (!normalizedSitemapUrls.has(normalizedUrl)) {
        issues.push({
          job_id: jobId,
          user_id: userId,
          domain,
          url: page.url,
          issue_type: 'not_in_sitemap',
        });
      }
    }

    // Check 2: Pages in sitemap that are noindex (contradictory)
    const crawledMap = new Map(crawledPages.map(p => [norm(p.url), p]));
    for (const sitemapUrl of sitemapUrls) {
      const page = crawledMap.get(norm(sitemapUrl));
      if (!page) continue;
      const hasNoindex = page.issues?.some(i => i.type === 'noindex_set');
      if (hasNoindex) {
        issues.push({
          job_id: jobId,
          user_id: userId,
          domain,
          url: sitemapUrl,
          issue_type: 'in_sitemap_but_noindex',
        });
      }
    }

    // Save all issues
    if (issues.length > 0) {
      await supabase.from('seofix_sitemap_issues').insert(issues);
    }

    await completeJob(jobId);
    console.log(`[${jobId}] Sitemap check done. ${issues.length} issues found.`);

  } catch (err) {
    console.error(`[${jobId}] Sitemap check failed:`, err);
    await failJob(jobId, err.message);
  }
}
