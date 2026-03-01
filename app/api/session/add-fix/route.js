/**
 * app/api/session/add-fix/route.js
 *
 * Adds a fix to the current session. This does two things:
 * 1. Commits the fixed file content to the shared session branch on GitHub
 * 2. Records the fix in seofix_fixes table
 *
 * If the branch doesn't exist yet on GitHub, we create it first.
 * Subsequent fixes just add more commits to the same branch.
 *
 * Body params:
 *   sessionId    — the session to add this fix to
 *   filePath     — e.g. "app/blog/page.js"
 *   fixedContent — full file content after fix
 *   issueType    — e.g. "title_too_long"
 *   issueTitle   — e.g. "Title tag too long"
 *   description  — the recommendation text
 *   pageUrl      — the live URL that had the issue
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function POST(request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: site } = await supabase
    .from('seofix_sites')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!site) return NextResponse.json({ error: 'No repository connected.' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }

  const { sessionId, filePath, originalContent, fixedContent, issueType, issueTitle, description, pageUrl } = body;

  if (!sessionId || !filePath || !fixedContent || !issueType) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // Load the session to get the branch name
  const { data: session } = await supabase
    .from('seofix_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .single();

  if (!session) return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  if (session.status !== 'open') return NextResponse.json({ error: 'Session is already closed.' }, { status: 400 });

  const { github_owner: owner, github_repo: repo, github_branch: baseBranch } = site;
  const token = user.github_token;
  const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  try {
    // ── Step 1: Ensure the session branch exists on GitHub ──
    // Check if branch already exists
    const branchCheck = await fetch(`${apiBase}/git/ref/heads/${session.branch_name}`, { headers });

    if (!branchCheck.ok) {
      // Branch doesn't exist yet — create it from the base branch tip
      const baseRes = await fetch(`${apiBase}/git/ref/heads/${baseBranch}`, { headers });
      if (!baseRes.ok) return NextResponse.json({ error: `Base branch "${baseBranch}" not found.` }, { status: 502 });

      const baseData = await baseRes.json();
      const baseSha = baseData.object.sha;

      const createRes = await fetch(`${apiBase}/git/refs`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${session.branch_name}`,
          sha: baseSha,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        return NextResponse.json({ error: `Could not create branch: ${err.message}` }, { status: 502 });
      }
    }

    // ── Step 2: Get current file SHA from the SESSION branch ──
    // Important: we read from the session branch, not main — in case
    // a previous fix in this session already modified this file.
    let fileSha = null;
    const fileRes = await fetch(
      `${apiBase}/contents/${filePath}?ref=${session.branch_name}`,
      { headers }
    );

    if (fileRes.ok) {
      const fileData = await fileRes.json();
      fileSha = fileData.sha;
    }

    // ── Step 3: Commit the fixed file to the session branch ──
    const encodedContent = Buffer.from(fixedContent, 'utf-8').toString('base64');

    const commitBody = {
      message: `fix(seo): ${issueTitle}\n\nPage: ${pageUrl || 'N/A'}\nFixed by SEOFix`,
      content: encodedContent,
      branch: session.branch_name,
    };

    if (fileSha) commitBody.sha = fileSha;

    const commitRes = await fetch(`${apiBase}/contents/${filePath}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(commitBody),
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return NextResponse.json({ error: `Could not commit fix: ${err.message}` }, { status: 502 });
    }

    // ── Step 4: Record the fix in Supabase ──
    const { data: fix, error: fixError } = await supabase
      .from('seofix_fixes')
      .insert({
        session_id: sessionId,
        page_url: pageUrl,
        file_path: filePath,
        issue_type: issueType,
        issue_title: issueTitle,
        description,
        original_content: originalContent || null,
        fixed_content: fixedContent,
        status: 'committed',
      })
      .select()
      .single();

    if (fixError) return NextResponse.json({ error: fixError.message }, { status: 500 });

    return NextResponse.json({ fix, branch: session.branch_name });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}