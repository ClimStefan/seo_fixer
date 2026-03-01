/**
 * app/api/auth/github/route.js — GitHub OAuth start
 *
 * When the user clicks "Connect GitHub", we redirect them to GitHub's
 * authorization page. GitHub asks the user to approve our app's access,
 * then redirects back to our callback URL with a temporary code.
 *
 * The 'state' parameter is a random string we generate and store in a cookie.
 * When GitHub redirects back, we verify the state matches — this prevents
 * CSRF attacks where a malicious site tricks the user into connecting
 * someone else's GitHub account.
 *
 * Scopes we request:
 * - repo: read and write access to repositories (needed to create PRs)
 * - user:email: read the user's email address
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  // Generate a random state string for CSRF protection
  const state = crypto.randomUUID();

  // Store state in a short-lived cookie so we can verify it in the callback
  const cookieStore = await cookies();
  cookieStore.set('github_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes — enough time to complete OAuth flow
    path: '/',
  });

  // Build the GitHub authorization URL
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/github/callback`,
    scope: 'repo user:email',
    state,
  });

  const githubAuthUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  return NextResponse.redirect(githubAuthUrl);
}
