/**
 * app/api/auth/github/callback/route.js — GitHub OAuth callback
 *
 * GitHub redirects here after the user approves our app.
 * The URL contains two query parameters:
 *   - code: a temporary one-time code we exchange for an access token
 *   - state: the random string we set earlier (we verify it matches)
 *
 * Flow:
 * 1. Verify state matches (CSRF check)
 * 2. Exchange code for GitHub access token
 * 3. Fetch the user's GitHub profile and email
 * 4. Create or update the user record in Supabase
 * 5. Set the session cookie
 * 6. Redirect to the connect page (repo selector)
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabase } from '../../../../../lib/supabase.js';
import { setSession } from '../../../../../lib/session.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // ── Step 1: Verify state (CSRF protection) ──
  const cookieStore = await cookies();
  const savedState = cookieStore.get('github_oauth_state')?.value;

  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${appUrl}/connect?error=invalid_state`);
  }

  // Clear the state cookie — it's single-use
  cookieStore.delete('github_oauth_state');

  if (!code) {
    return NextResponse.redirect(`${appUrl}/connect?error=no_code`);
  }

  // ── Step 2: Exchange code for access token ──
  let accessToken;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${appUrl}/api/auth/github/callback`,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('GitHub token error:', tokenData);
      return NextResponse.redirect(`${appUrl}/connect?error=token_failed`);
    }

    accessToken = tokenData.access_token;
  } catch (err) {
    console.error('Token exchange failed:', err);
    return NextResponse.redirect(`${appUrl}/connect?error=token_failed`);
  }

  // ── Step 3: Fetch GitHub user profile ──
  let githubUser;
  let githubEmail;
  try {
    // Fetch basic profile
    const profileRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    githubUser = await profileRes.json();

    // Fetch email separately — it may be private and not in the profile
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    const emails = await emailRes.json();
    // Pick the primary verified email
    const primaryEmail = emails.find(e => e.primary && e.verified);
    githubEmail = primaryEmail?.email || githubUser.email || null;
  } catch (err) {
    console.error('GitHub profile fetch failed:', err);
    return NextResponse.redirect(`${appUrl}/connect?error=profile_failed`);
  }

  // ── Step 4: Create or update user in Supabase ──
  // We use github_username as the unique identifier — if the user
  // has connected before, we update their token (it may have changed).
  let userId;
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('seofix_users')
      .select('id')
      .eq('github_username', githubUser.login)
      .single();

    if (existingUser) {
      // Update their token and profile info
      await supabase
        .from('seofix_users')
        .update({
          github_token: accessToken,
          github_avatar: githubUser.avatar_url,
          email: githubEmail,
        })
        .eq('id', existingUser.id);

      userId = existingUser.id;
    } else {
      // Create new user
      const { data: newUser, error } = await supabase
        .from('seofix_users')
        .insert({
          email: githubEmail,
          github_token: accessToken,
          github_username: githubUser.login,
          github_avatar: githubUser.avatar_url,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Supabase insert error:', error);
        return NextResponse.redirect(`${appUrl}/connect?error=db_failed`);
      }

      userId = newUser.id;
    }
  } catch (err) {
    console.error('Database error:', err);
    return NextResponse.redirect(`${appUrl}/connect?error=db_failed`);
  }

  // ── Step 5: Set session cookie ──
  await setSession(userId);

  // ── Step 6: Redirect to repo selector ──
  return NextResponse.redirect(`${appUrl}/connect?success=true`);
}
