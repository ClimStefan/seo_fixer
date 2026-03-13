/**
 * app/api/github/file/route.js
 *
 * Fetches the raw content of a file from the user's connected GitHub repo.
 * Used in the fix panel to show the current file content before editing.
 *
 * Query params:
 *   path — file path in the repo, e.g. "app/page.js"
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

export async function GET(request) {
const authObject = await auth();
const userId = authObject.userId;
if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: site } = await supabase
    .from('seofix_sites')
    .select('*')
    .eq('user_id', userId)
    .single();

    const { data: user } = await supabase
  .from('seofix_users')
  .select('github_token')
  .eq('id', userId)
  .single();

if (!user?.github_token) return NextResponse.json({ error: 'No GitHub token.' }, { status: 401 });

  if (!site) {
    return NextResponse.json({ error: 'No repository connected.' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Missing path parameter.' }, { status: 400 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${site.github_owner}/${site.github_repo}/contents/${filePath}`,
    {
      headers: {
        Authorization: `Bearer ${user.github_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'File not found in repository.' }, { status: 404 });
  }

  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');

  return NextResponse.json({
    path: filePath,
    content,
    sha: data.sha,
    size: data.size,
  });
}
