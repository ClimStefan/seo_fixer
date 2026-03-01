/**
 * lib/urlToFile.js — URL to file path mapper
 *
 * Given a live page URL like "https://example.com/blog/my-post"
 * and a list of page files from the repo like:
 *   ["app/page.js", "app/blog/[slug]/page.js", "app/pricing/page.js"]
 *
 * This returns the best matching file path — "app/blog/[slug]/page.js"
 *
 * It handles:
 * - Static routes: /pricing → app/pricing/page.js
 * - Dynamic routes: /blog/any-slug → app/blog/[slug]/page.js
 * - Catch-all routes: /docs/a/b/c → app/docs/[...slug]/page.js
 * - Root route: / → app/page.js
 * - Pages Router: /blog → pages/blog/index.js or pages/blog.js
 * - Nested dynamic: /shop/[category]/[id] → matches two dynamic segments
 *
 * Returns { filePath, confidence } where confidence is:
 *   'exact'   — static route matched exactly
 *   'dynamic' — matched via dynamic segment pattern
 *   'partial' — matched the start of the path (best guess)
 *   null      — no match found
 */

/**
 * Converts a URL path like "/blog/my-post" into segments ["blog", "my-post"]
 */
function urlToSegments(urlPath) {
  return urlPath
    .split('/')
    .filter(Boolean); // remove empty strings from leading/trailing slashes
}

/**
 * Converts a file path like "app/blog/[slug]/page.js" into
 * route segments ["blog", "[slug]"] — strips the app/ prefix and page.js suffix.
 */
function fileToRouteSegments(filePath) {
  // Remove common prefixes
  let path = filePath
    .replace(/^app\//, '')        // Next.js App Router prefix
    .replace(/^src\/app\//, '')   // src/app variant
    .replace(/^pages\//, '')      // Next.js Pages Router prefix
    .replace(/^src\/pages\//, ''); // src/pages variant

  // Remove the filename at the end (page.js, index.js, etc.)
  const parts = path.split('/');
  const filename = parts[parts.length - 1];

  if (['page.js', 'page.jsx', 'page.tsx', 'page.ts',
       'index.js', 'index.jsx', 'index.tsx', 'index.ts'].includes(filename)) {
    parts.pop(); // remove the filename
  } else {
    // For pages like "pages/about.js" — the file itself IS the route
    // Remove the extension
    parts[parts.length - 1] = filename.replace(/\.(js|jsx|tsx|ts)$/, '');
  }

  return parts.filter(Boolean);
}

/**
 * Checks if a URL segment matches a route segment.
 * URL segment: "my-post" (an actual value)
 * Route segment: "[slug]" (a dynamic param) or "blog" (a static segment)
 *
 * Returns:
 *   2 — exact static match ("blog" === "blog")
 *   1 — dynamic match ("[slug]" matches "my-post")
 *   0 — no match
 */
function segmentScore(urlSegment, routeSegment) {
  // Catch-all segment [...slug] matches one or more segments
  if (routeSegment.startsWith('[...') && routeSegment.endsWith(']')) return 1;
  // Optional catch-all [[...slug]]
  if (routeSegment.startsWith('[[...') && routeSegment.endsWith(']]')) return 1;
  // Dynamic segment [slug] matches any single value
  if (routeSegment.startsWith('[') && routeSegment.endsWith(']')) return 1;
  // Static match
  if (urlSegment.toLowerCase() === routeSegment.toLowerCase()) return 2;
  return 0;
}

/**
 * Main export — finds the best matching file for a given URL.
 *
 * @param {string} pageUrl — full URL e.g. "https://example.com/blog/my-post"
 * @param {string[]} pageFiles — array of file paths from the repo
 * @returns {{ filePath: string, confidence: string } | null}
 */
export function findFileForUrl(pageUrl, pageFiles) {
  let urlPath;
  try {
    urlPath = new URL(pageUrl).pathname;
  } catch {
    return null;
  }

  const urlSegments = urlToSegments(urlPath);

  // Score each candidate file
  const scored = pageFiles.map(filePath => {
    const routeSegments = fileToRouteSegments(filePath);

    // Special case: root route "/" matches app/page.js (zero segments)
    if (urlSegments.length === 0 && routeSegments.length === 0) {
      return { filePath, score: 100, confidence: 'exact' };
    }

    // If segment counts don't match, check for catch-all routes
    const hasCatchAll = routeSegments.some(s =>
      s.startsWith('[...') || s.startsWith('[[...')
    );

    if (!hasCatchAll && routeSegments.length !== urlSegments.length) {
      return { filePath, score: 0, confidence: null };
    }

    // Score each segment pair
    let totalScore = 0;
    let allMatch = true;

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSeg = routeSegments[i];

      // Catch-all matches remaining segments
      if (routeSeg.startsWith('[...') || routeSeg.startsWith('[[...')) {
        totalScore += 1;
        break;
      }

      const urlSeg = urlSegments[i];
      if (!urlSeg) { allMatch = false; break; }

      const s = segmentScore(urlSeg, routeSeg);
      if (s === 0) { allMatch = false; break; }
      totalScore += s;
    }

    if (!allMatch) return { filePath, score: 0, confidence: null };

    // Determine confidence based on how many segments were exact vs dynamic
    const exactSegments = routeSegments.filter((s, i) =>
      urlSegments[i] && segmentScore(urlSegments[i], s) === 2
    ).length;

    let confidence;
    if (exactSegments === routeSegments.length) {
      confidence = 'exact';
      totalScore += 10; // bonus for fully static match
    } else if (totalScore > 0) {
      confidence = 'dynamic';
    } else {
      confidence = null;
    }

    return { filePath, score: totalScore, confidence };
  });

  // Find the highest scoring match
  const best = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!best) return null;

  return {
    filePath: best.filePath,
    confidence: best.confidence,
  };
}

/**
 * Finds multiple possible matches ranked by score.
 * Used to show the user alternative file options if the top match is wrong.
 *
 * @returns Array of { filePath, confidence } sorted best first
 */
export function findFileCandidates(pageUrl, pageFiles, limit = 3) {
  let urlPath;
  try {
    urlPath = new URL(pageUrl).pathname;
  } catch {
    return [];
  }

  const urlSegments = urlToSegments(urlPath);

  return pageFiles
    .map(filePath => {
      const routeSegments = fileToRouteSegments(filePath);

      if (urlSegments.length === 0 && routeSegments.length === 0) {
        return { filePath, score: 100, confidence: 'exact' };
      }

      const hasCatchAll = routeSegments.some(s => s.startsWith('[...'));
      if (!hasCatchAll && routeSegments.length !== urlSegments.length) {
        return { filePath, score: 0, confidence: null };
      }

      let totalScore = 0;
      let allMatch = true;

      for (let i = 0; i < routeSegments.length; i++) {
        const routeSeg = routeSegments[i];
        if (routeSeg.startsWith('[...')) { totalScore += 1; break; }
        const urlSeg = urlSegments[i];
        if (!urlSeg) { allMatch = false; break; }
        const s = segmentScore(urlSeg, routeSeg);
        if (s === 0) { allMatch = false; break; }
        totalScore += s;
      }

      if (!allMatch) return { filePath, score: 0, confidence: null };

      const exactSegments = routeSegments.filter((s, i) =>
        urlSegments[i] && segmentScore(urlSegments[i], s) === 2
      ).length;

      const confidence = exactSegments === routeSegments.length ? 'exact' : 'dynamic';
      if (confidence === 'exact') totalScore += 10;

      return { filePath, score: totalScore, confidence };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ filePath, confidence }) => ({ filePath, confidence }));
}
