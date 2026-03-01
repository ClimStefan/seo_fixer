/**
 * app/api/github/repos/route.js
 *
 * Fetches the list of repos the logged-in user has access to on GitHub.
 * Used in the connect page repo selector dropdown.
 * Returns repos sorted by most recently updated.
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Fetch up to 100 repos — enough for most users
    // type=all includes repos they own + org repos they have access to
    const res = await fetch(
      'https://api.github.com/user/repos?per_page=100&sort=updated&type=all',
      {
        headers: {
          Authorization: `Bearer ${user.github_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch repos from GitHub' }, { status: 502 });
    }

    const repos = await res.json();

    // Return only the fields we need — no need to send the full GitHub response
    const simplified = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,      // "owner/repo-name"
      owner: repo.owner.login,
      private: repo.private,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at,
      url: repo.html_url,
    }));

    return NextResponse.json({ repos: simplified });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
