/**
 * app/api/auth/me/route.js
 *
 * Returns the current user's profile (without the GitHub token).
 * The frontend calls this on load to know if the user is logged in.
 * We never send the github_token to the client — it stays server-side only.
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';

export async function GET() {
  const user = await getSession();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  // Return user info but strip the sensitive github_token
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      github_username: user.github_username,
      github_avatar: user.github_avatar,
    },
  });
}
