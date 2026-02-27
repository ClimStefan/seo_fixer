/**
 * audit.js — Core SEO audit engine
 *
 * This runs entirely server-side (Node.js). It fetches the target URL,
 * parses the HTML, and runs a series of rule-based checks against it.
 * No AI is involved here — this is pure deterministic rule evaluation.
 * Claude only enters the picture when the user clicks "Fix".
 *
 * Each check returns an issue object or null (if no issue found).
 * Issues have a type, severity, title, description, current value,
 * and a recommendation. The severity field drives the badge color in the UI.
 */

/**
 * Fetches the HTML for a given URL.
 * We set a browser-like User-Agent so sites don't block us.
 * We also set a 10s timeout — slow sites shouldn't hang the whole audit.
 */
async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; SEOFix/1.0; +https://seofix.io/bot)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    // We track the final URL after any redirects — important for canonical checks
    const finalUrl = response.url;
    const html = await response.text();
    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());

    return { html, finalUrl, status, headers, ok: response.ok };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Parses raw HTML into a simple structure we can query.
 * We use regex + basic string ops here instead of a full DOM parser
 * because we're in a server environment and want zero extra dependencies
 * for the free audit tier. For the paid crawler, we'll swap in cheerio.
 */
function parseHtml(html) {
  // Extract content between two tags (first match only)
  const extract = (pattern) => {
    const match = html.match(pattern);
    return match ? match[1] : null;
  };

  // Extract attribute value from a tag
  const extractAttr = (tag, attr) => {
    const pattern = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']*)["'][^>]*>`, 'i');
    const match = html.match(pattern);
    return match ? match[1] : null;
  };

  // Extract all matches (for multi-occurrence checks like H1s, images)
  const extractAll = (pattern) => {
    const matches = [];
    let m;
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    while ((m = re.exec(html)) !== null) {
      matches.push(m[1] || m[0]);
    }
    return matches;
  };

  return {
    // <title> tag content
    title: extract(/<title[^>]*>([^<]*)<\/title>/i),

    // <meta name="description"> content attribute
    metaDescription: (() => {
      const m = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*/i)
                || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // <link rel="canonical"> href attribute
    canonical: (() => {
      const m = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*/i)
                || html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // All H1 tags — we want exactly one
    h1s: extractAll(/<h1[^>]*>([^<]*(?:<(?!\/h1)[^<]*)*)<\/h1>/i),

    // All H2 tags — for heading structure check
    h2s: extractAll(/<h2[^>]*>([^<]*)<\/h2>/i),

    // All images — we check for missing alt text
    images: (() => {
      const imgs = [];
      const re = /<img([^>]*)>/gi;
      let m;
      while ((m = re.exec(html)) !== null) {
        const attrs = m[1];
        const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
        const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
        imgs.push({
          src: srcMatch ? srcMatch[1] : '',
          alt: altMatch ? altMatch[1] : null, // null means attr missing entirely
        });
      }
      return imgs;
    })(),

    // robots meta tag
    robotsMeta: (() => {
      const m = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // Open Graph title
    ogTitle: (() => {
      const m = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // Open Graph description
    ogDescription: (() => {
      const m = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // Lang attribute on <html>
    htmlLang: (() => {
      const m = html.match(/<html[^>]*lang=["']([^"']*)["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // Viewport meta tag — mobile-friendliness signal
    viewport: (() => {
      const m = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["'][^>]*/i);
      return m ? m[1] : null;
    })(),

    // Schema.org markup presence
    hasSchema: html.includes('application/ld+json') || html.includes('itemtype="http://schema.org'),

    // Word count approximation — strips all tags, counts words
    wordCount: (() => {
      const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                       .replace(/<[^>]+>/g, ' ')
                       .replace(/\s+/g, ' ')
                       .trim();
      return text.split(' ').filter(w => w.length > 0).length;
    })(),

    // Raw HTML for further checks
    raw: html,
  };
}

/**
 * ─────────────────────────────────────────
 * INDIVIDUAL CHECK FUNCTIONS
 * Each returns an issue object or null.
 * ─────────────────────────────────────────
 *
 * Issue schema:
 * {
 *   id: string           — unique key (used as React key and for fix routing)
 *   type: string         — machine-readable category
 *   severity: string     — 'critical' | 'warning' | 'info'
 *   title: string        — short human-readable name
 *   description: string  — what the problem is
 *   currentValue: string — what we actually found (or null)
 *   recommendation: string — what to do about it
 *   canAutoFix: boolean  — whether Claude can fix it without user input
 * }
 */

function checkTitle(parsed, url) {
  if (!parsed.title) {
    return {
      id: 'missing-title',
      type: 'missing_title',
      severity: 'critical',
      title: 'Missing title tag',
      description: 'The page has no <title> tag. This is one of the most important on-page SEO elements — search engines use it as the main headline in search results.',
      currentValue: null,
      recommendation: 'Add a descriptive <title> tag between 30–60 characters that includes your primary keyword.',
      canAutoFix: true,
    };
  }

  const len = parsed.title.length;

  if (len > 60) {
    return {
      id: 'title-too-long',
      type: 'title_too_long',
      severity: 'warning',
      title: 'Title tag too long',
      description: `Your title is ${len} characters. Google typically displays the first 50–60 characters — anything beyond that gets cut off in search results with "...".`,
      currentValue: parsed.title,
      recommendation: 'Shorten your title to under 60 characters while keeping the primary keyword near the beginning.',
      canAutoFix: true,
    };
  }

  if (len < 30) {
    return {
      id: 'title-too-short',
      type: 'title_too_short',
      severity: 'warning',
      title: 'Title tag too short',
      description: `Your title is only ${len} characters. Short titles miss an opportunity to include relevant keywords and descriptive context that helps both users and search engines understand the page.`,
      currentValue: parsed.title,
      recommendation: 'Expand your title to 30–60 characters. Include your primary keyword and a brief description of the page.',
      canAutoFix: true,
    };
  }

  return null; // no issue
}

function checkMetaDescription(parsed) {
  if (!parsed.metaDescription) {
    return {
      id: 'missing-meta-description',
      type: 'missing_meta_description',
      severity: 'critical',
      title: 'Missing meta description',
      description: 'The page has no meta description. While not a direct ranking factor, Google often uses this text as the snippet under your title in search results. A missing description means Google will pick any text it finds, which is usually worse.',
      currentValue: null,
      recommendation: 'Add a meta description between 120–160 characters that summarizes the page and includes a call to action.',
      canAutoFix: true,
    };
  }

  const len = parsed.metaDescription.length;

  if (len > 160) {
    return {
      id: 'meta-description-too-long',
      type: 'meta_description_too_long',
      severity: 'warning',
      title: 'Meta description too long',
      description: `Your meta description is ${len} characters. Google truncates descriptions around 155–160 characters in search results.`,
      currentValue: parsed.metaDescription,
      recommendation: 'Trim your meta description to under 160 characters, keeping the most important information at the beginning.',
      canAutoFix: true,
    };
  }

  if (len < 70) {
    return {
      id: 'meta-description-too-short',
      type: 'meta_description_too_short',
      severity: 'info',
      title: 'Meta description is short',
      description: `Your meta description is only ${len} characters. You have room to add more context and a stronger call to action.`,
      currentValue: parsed.metaDescription,
      recommendation: 'Expand your meta description to 120–160 characters to take advantage of the full available space.',
      canAutoFix: true,
    };
  }

  return null;
}

function checkCanonical(parsed, finalUrl) {
  if (!parsed.canonical) {
    return {
      id: 'missing-canonical',
      type: 'missing_canonical',
      severity: 'critical',
      title: 'Missing canonical tag',
      description: 'No canonical tag found. Without a canonical tag, search engines may index multiple versions of the same page (http vs https, www vs non-www, trailing slash vs no slash), splitting your ranking signals.',
      currentValue: null,
      recommendation: `Add a self-referencing canonical tag pointing to the preferred version of this page.`,
      canAutoFix: true,
    };
  }

  // Check if canonical is self-referencing (good) or points somewhere unexpected
  // We normalize both URLs by removing trailing slashes for comparison
  const normalize = (u) => u.replace(/\/$/, '').toLowerCase();

  if (normalize(parsed.canonical) !== normalize(finalUrl)) {
    return {
      id: 'canonical-mismatch',
      type: 'canonical_mismatch',
      severity: 'warning',
      title: 'Canonical points to a different URL',
      description: `The canonical tag points to "${parsed.canonical}" but the page URL is "${finalUrl}". This tells search engines the current page is a duplicate — intentional canonicalization is fine, but unintentional mismatches can hurt rankings.`,
      currentValue: parsed.canonical,
      recommendation: 'Verify this is intentional. If not, update the canonical to match the current page URL.',
      canAutoFix: false, // requires user decision — which URL is correct?
    };
  }

  return null;
}

function checkH1(parsed) {
  if (!parsed.h1s || parsed.h1s.length === 0) {
    return {
      id: 'missing-h1',
      type: 'missing_h1',
      severity: 'critical',
      title: 'Missing H1 heading',
      description: 'The page has no H1 tag. The H1 is the main heading of your page and is a strong on-page SEO signal. It tells search engines (and users) what the page is primarily about.',
      currentValue: null,
      recommendation: 'Add a single H1 tag that includes your primary keyword and accurately describes the page content.',
      canAutoFix: true,
    };
  }

  if (parsed.h1s.length > 1) {
    return {
      id: 'multiple-h1',
      type: 'multiple_h1',
      severity: 'warning',
      title: `Multiple H1 tags (${parsed.h1s.length} found)`,
      description: `The page has ${parsed.h1s.length} H1 tags. While not a hard rule, having one clear H1 is best practice and avoids diluting the primary topic signal.`,
      currentValue: parsed.h1s.join(' | '),
      recommendation: 'Keep one H1 that defines the main topic. Convert other H1s to H2 or H3 subheadings.',
      canAutoFix: false, // requires user to decide which H1 to keep
    };
  }

  const h1Text = parsed.h1s[0] ? parsed.h1s[0].replace(/<[^>]+>/g, '').trim() : '';

  if (h1Text.length > 70) {
    return {
      id: 'h1-too-long',
      type: 'h1_too_long',
      severity: 'info',
      title: 'H1 heading is very long',
      description: `Your H1 is ${h1Text.length} characters. Long H1s can dilute the keyword signal and look bad on smaller screens.`,
      currentValue: h1Text,
      recommendation: 'Consider shortening your H1 to focus on the core topic. Aim for under 60 characters.',
      canAutoFix: true,
    };
  }

  return null;
}

function checkImages(parsed) {
  // Find images missing alt text entirely (alt attribute not present at all)
  const missingAlt = parsed.images.filter(img => img.alt === null && img.src && !img.src.startsWith('data:'));
  // Find images with empty alt (alt="" — acceptable for decorative images, but flagged as info)
  const emptyAlt = parsed.images.filter(img => img.alt === '' && img.src && !img.src.startsWith('data:'));

  if (missingAlt.length > 0) {
    return {
      id: 'missing-alt-text',
      type: 'missing_alt_text',
      severity: 'warning',
      title: `${missingAlt.length} image${missingAlt.length > 1 ? 's' : ''} missing alt text`,
      description: `Found ${missingAlt.length} image${missingAlt.length > 1 ? 's' : ''} without an alt attribute. Alt text helps search engines understand images and is required for accessibility (screen readers).`,
      currentValue: missingAlt.slice(0, 3).map(i => i.src).join(', ') + (missingAlt.length > 3 ? ` ...and ${missingAlt.length - 3} more` : ''),
      recommendation: 'Add descriptive alt text to every content image. For decorative images, use alt="" (empty string).',
      canAutoFix: true, // Claude can generate alt text from the filename/context
    };
  }

  return null;
}

function checkViewport(parsed) {
  if (!parsed.viewport) {
    return {
      id: 'missing-viewport',
      type: 'missing_viewport',
      severity: 'critical',
      title: 'Missing viewport meta tag',
      description: 'No viewport meta tag found. Without this, mobile browsers render the page at desktop width and scale it down, making it nearly unusable on phones. Google also uses mobile-first indexing, so this directly impacts rankings.',
      currentValue: null,
      recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to your <head>.',
      canAutoFix: true,
    };
  }
  return null;
}

function checkHtmlLang(parsed) {
  if (!parsed.htmlLang) {
    return {
      id: 'missing-lang',
      type: 'missing_html_lang',
      severity: 'warning',
      title: 'Missing lang attribute on <html>',
      description: 'The <html> tag has no lang attribute. This attribute tells browsers and search engines what language the page is in, which affects accessibility and how Google indexes the page for international search.',
      currentValue: null,
      recommendation: 'Add a lang attribute to your <html> tag, e.g. <html lang="en">.',
      canAutoFix: true,
    };
  }
  return null;
}

function checkSchema(parsed) {
  if (!parsed.hasSchema) {
    return {
      id: 'missing-schema',
      type: 'missing_schema',
      severity: 'info',
      title: 'No structured data (Schema.org) detected',
      description: 'No JSON-LD or microdata schema markup was found. Structured data helps Google understand your content and can unlock rich results in search (stars, FAQs, breadcrumbs, etc.).',
      currentValue: null,
      recommendation: 'Add Schema.org markup relevant to your page type — Organization and WebSite schema are good starting points for any site.',
      canAutoFix: false, // requires understanding of content type
    };
  }
  return null;
}

function checkContentLength(parsed) {
  if (parsed.wordCount < 300) {
    return {
      id: 'thin-content',
      type: 'thin_content',
      severity: 'warning',
      title: `Thin content (${parsed.wordCount} words)`,
      description: `The page has only approximately ${parsed.wordCount} words of text content. Pages with very little content are often considered "thin" by Google and may rank poorly or not at all.`,
      currentValue: `~${parsed.wordCount} words`,
      recommendation: 'Add more meaningful content to the page. Aim for at least 300 words for informational pages. Focus on content that genuinely helps your users.',
      canAutoFix: false, // content creation requires human input
    };
  }
  return null;
}

function checkRobotsMeta(parsed) {
  if (parsed.robotsMeta && (
    parsed.robotsMeta.includes('noindex') ||
    parsed.robotsMeta.includes('none')
  )) {
    return {
      id: 'noindex',
      type: 'noindex_set',
      severity: 'critical',
      title: 'Page is set to noindex',
      description: `The robots meta tag is set to "${parsed.robotsMeta}". This tells search engines not to index this page — it will not appear in search results at all.`,
      currentValue: parsed.robotsMeta,
      recommendation: 'If you want this page to rank, remove the noindex directive. If this is intentional (e.g. a thank-you page), this can be ignored.',
      canAutoFix: false, // requires user to confirm intent
    };
  }
  return null;
}

function checkOpenGraph(parsed) {
  const issues = [];

  if (!parsed.ogTitle) {
    issues.push('og:title');
  }
  if (!parsed.ogDescription) {
    issues.push('og:description');
  }

  if (issues.length > 0) {
    return {
      id: 'missing-og-tags',
      type: 'missing_og_tags',
      severity: 'info',
      title: `Missing Open Graph tags: ${issues.join(', ')}`,
      description: 'Open Graph tags control how your page appears when shared on social media (Twitter, LinkedIn, Facebook). Without them, social platforms pick arbitrary text and images, which usually looks bad.',
      currentValue: null,
      recommendation: 'Add og:title, og:description, and og:image tags to your <head>.',
      canAutoFix: true,
    };
  }

  return null;
}

/**
 * ─────────────────────────────────────────
 * MAIN AUDIT FUNCTION
 * This is what the API route calls.
 * Returns { url, finalUrl, issues, score, parsedData, error }
 * ─────────────────────────────────────────
 */
export async function auditUrl(rawUrl) {
  // Normalize the URL — add https:// if missing
  let url = rawUrl.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  let fetchResult;
  try {
    fetchResult = await fetchPage(url);
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'The page took too long to respond (timeout after 10s). Try again or check if the URL is correct.' };
    }
    return { error: `Could not reach the URL. Make sure it is publicly accessible. (${err.message})` };
  }

  if (!fetchResult.ok) {
    return {
      error: `The page returned an HTTP ${fetchResult.status} error. Make sure the URL is correct and the page is publicly accessible.`,
    };
  }

  const parsed = parseHtml(fetchResult.html);

  // Run all checks — collect non-null results
  const checks = [
    checkRobotsMeta(parsed),           // First — if noindex, rest barely matters
    checkTitle(parsed, url),
    checkMetaDescription(parsed),
    checkCanonical(parsed, fetchResult.finalUrl),
    checkH1(parsed),
    checkImages(parsed),
    checkViewport(parsed),
    checkHtmlLang(parsed),
    checkOpenGraph(parsed),
    checkSchema(parsed),
    checkContentLength(parsed),
  ];

  const issues = checks.filter(Boolean);

  // Score: start at 100, deduct points per issue by severity
  // Critical: -20, Warning: -10, Info: -5 (floor at 0)
  const deductions = {
    critical: 20,
    warning: 10,
    info: 5,
  };

  const score = Math.max(
    0,
    100 - issues.reduce((sum, issue) => sum + (deductions[issue.severity] || 0), 0)
  );

  return {
    url,
    finalUrl: fetchResult.finalUrl,
    issues,
    score,
    counts: {
      critical: issues.filter(i => i.severity === 'critical').length,
      warning: issues.filter(i => i.severity === 'warning').length,
      info: issues.filter(i => i.severity === 'info').length,
      total: issues.length,
    },
    meta: {
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      wordCount: parsed.wordCount,
      imageCount: parsed.images.length,
    },
  };
}
