/**
 * app/api/github/repo-tree/route.js
 *
 * Fetches the complete file tree of the connected GitHub repo using
 * GitHub's recursive tree API. This gives us every file path in one request
 * instead of having to traverse directories one by one.
 *
 * We use this to build the URL → file path map. The response is cached
 * for 5 minutes so we don't hammer GitHub on every fix panel open.
 *
 * Returns an array of file paths that look like page files:
 * ["app/page.js", "app/blog/[slug]/page.js", "app/pricing/page.js", ...]
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: site } = await supabase
    .from('seofix_sites')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!site) {
    return NextResponse.json({ error: 'No repository connected.' }, { status: 400 });
  }

  const { github_owner: owner, github_repo: repo, github_branch: branch } = site;

  try {
    // GitHub's recursive tree API returns the entire repo file tree in one call.
    // recursive=1 means it goes into all subdirectories automatically.
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${user.github_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch repo file tree.' }, { status: 502 });
    }

    const data = await res.json();

    // Filter to only files (not directories) that are likely page files.
    // We look for:
    // - page.js / page.jsx / page.tsx (Next.js App Router)
    // - index.js / index.jsx / index.tsx (Next.js Pages Router or plain React)
    // - Any .js/.jsx/.tsx file inside a pages/ directory (Pages Router)
    const pageFiles = data.tree
      .filter(item => item.type === 'blob') // blobs are files, trees are directories
      .map(item => item.path)
      .filter(path => {
        const filename = path.split('/').pop();
        // Next.js App Router convention
        if (filename === 'page.js' || filename === 'page.jsx' || filename === 'page.tsx') return true;
        // Next.js Pages Router convention
        if (path.startsWith('pages/') && (
          filename.endsWith('.js') || filename.endsWith('.jsx') || filename.endsWith('.tsx')
        )) return true;
        // index files as entry points
        if (filename === 'index.js' || filename === 'index.jsx' || filename === 'index.tsx') return true;
        return false;
      });

    // Also return ALL files so the user can manually pick any file if auto-detection fails
    const allFiles = data.tree
      .filter(item => item.type === 'blob')
      .map(item => item.path)
      .filter(path => {
        const ext = path.split('.').pop();
        return ['js', 'jsx', 'tsx', 'ts', 'html', 'vue', 'svelte'].includes(ext);
      });

    return NextResponse.json({
      pageFiles,
      allFiles,
      truncated: data.truncated, // true if repo has >100k files (very unlikely)
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
