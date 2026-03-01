/**
 * app/api/github/create-pr/route.js — Create a GitHub Pull Request
 *
 * This is the core of the fix flow. Given a file path, the original content,
 * and the fixed content, it:
 * 1. Gets the current file from GitHub (to get its SHA — required for updates)
 * 2. Creates a new branch off main (named seofix/issue-type-timestamp)
 * 3. Commits the fixed file to that branch
 * 4. Opens a pull request with a description of what was fixed and why
 *
 * We never push directly to main. Always a PR so the user reviews and merges.
 *
 * Body params:
 *   filePath     — path in the repo, e.g. "app/page.js"
 *   fixedContent — the full file content after the fix is applied
 *   issueType    — e.g. "missing_title" (used for branch name and PR title)
 *   issueTitle   — human readable, e.g. "Missing title tag"
 *   description  — explanation of what was changed and why
 *   pageUrl      — the live URL that had the issue (shown in PR body)
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function POST(request) {
  // ── Auth check ──
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // ── Load the user's connected repo ──
  const { data: site } = await supabase
    .from('seofix_sites')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!site) {
    return NextResponse.json(
      { error: 'No repository connected. Go to /connect to link your GitHub repo.' },
      { status: 400 }
    );
  }

  // ── Parse request body ──
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { filePath, fixedContent, issueType, issueTitle, description, pageUrl } = body;

  if (!filePath || !fixedContent || !issueType) {
    return NextResponse.json(
      { error: 'Missing required fields: filePath, fixedContent, issueType.' },
      { status: 400 }
    );
  }

  const owner = site.github_owner;
  const repo = site.github_repo;
  const baseBranch = site.github_branch || 'main';
  const token = user.github_token;

  // GitHub API base headers — reused across all requests
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

  try {
    // ── Step 1: Get the current file to obtain its SHA ──
    // GitHub requires the file's current SHA when updating a file.
    // Without it the API rejects the commit.
    let fileSha = null;
    let currentContent = null;

    const fileRes = await fetch(`${apiBase}/contents/${filePath}`, { headers });

    if (fileRes.ok) {
      const fileData = await fileRes.json();
      fileSha = fileData.sha;
      // Decode existing content from base64 for reference
      currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');
    } else if (fileRes.status === 404) {
      // File doesn't exist yet — we'll create it (rare case)
      fileSha = null;
    } else {
      const err = await fileRes.json();
      return NextResponse.json(
        { error: `Could not read file from GitHub: ${err.message}` },
        { status: 502 }
      );
    }

    // ── Step 2: Get the SHA of the base branch tip ──
    // We need this to create a new branch pointing to the same commit.
    const branchRes = await fetch(`${apiBase}/git/ref/heads/${baseBranch}`, { headers });

    if (!branchRes.ok) {
      return NextResponse.json(
        { error: `Could not find branch "${baseBranch}" in your repository.` },
        { status: 502 }
      );
    }

    const branchData = await branchRes.json();
    const baseSha = branchData.object.sha;

    // ── Step 3: Create a new branch for this fix ──
    // Branch name format: seofix/missing-title-1709123456
    // The timestamp ensures uniqueness if the same issue is fixed multiple times.
    const timestamp = Date.now();
    const branchSlug = issueType.replace(/_/g, '-').toLowerCase();
    const newBranch = `seofix/${branchSlug}-${timestamp}`;

    const createBranchRes = await fetch(`${apiBase}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${newBranch}`,
        sha: baseSha,
      }),
    });

    if (!createBranchRes.ok) {
      const err = await createBranchRes.json();
      return NextResponse.json(
        { error: `Could not create branch: ${err.message}` },
        { status: 502 }
      );
    }

    // ── Step 4: Commit the fixed file to the new branch ──
    // We encode the new content as base64 — that's what GitHub's API expects.
    const encodedContent = Buffer.from(fixedContent, 'utf-8').toString('base64');

    const commitBody = {
      message: `fix(seo): ${issueTitle}\n\nFixed by SEOFix — ${pageUrl || 'manual fix'}`,
      content: encodedContent,
      branch: newBranch,
    };

    // If the file already exists, include its SHA so GitHub knows to update not create
    if (fileSha) {
      commitBody.sha = fileSha;
    }

    const commitRes = await fetch(`${apiBase}/contents/${filePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(commitBody),
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return NextResponse.json(
        { error: `Could not commit fix: ${err.message}` },
        { status: 502 }
      );
    }

    // ── Step 5: Open the pull request ──
    const prBody = buildPrBody({ issueTitle, description, pageUrl, filePath });

    const prRes = await fetch(`${apiBase}/pulls`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `[SEOFix] ${issueTitle}`,
        body: prBody,
        head: newBranch,
        base: baseBranch,
      }),
    });

    if (!prRes.ok) {
      const err = await prRes.json();
      return NextResponse.json(
        { error: `Could not create pull request: ${err.message}` },
        { status: 502 }
      );
    }

    const pr = await prRes.json();

    return NextResponse.json({
      success: true,
      pr: {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        branch: newBranch,
      },
    });

  } catch (err) {
    console.error('PR creation error:', err);
    return NextResponse.json(
      { error: `Unexpected error: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * Builds the pull request body markdown.
 * This is what the developer sees when they open the PR on GitHub.
 * It explains what was changed, why, and links back to the affected page.
 */
function buildPrBody({ issueTitle, description, pageUrl, filePath }) {
  return `## SEO Fix: ${issueTitle}

${description || 'This pull request was generated by SEOFix to address an SEO issue found during a site audit.'}

---

**Affected page:** ${pageUrl ? `[${pageUrl}](${pageUrl})` : 'N/A'}
**File changed:** \`${filePath}\`

---

### What was changed

This PR was created by [SEOFix](https://seo-fixer.vercel.app) based on an automated SEO audit.
Please review the changes before merging. If anything looks wrong, close this PR and fix manually.

> This PR was generated by SEOFix. Always review before merging.
`;
}
