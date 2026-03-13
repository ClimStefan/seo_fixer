/**
 * app/api/auth/me/route.js
 *
 * Returns the current user's profile (without the GitHub token).
 * The frontend calls this on load to know if the user is logged in.
 * We never send the github_token to the client — it stays server-side only.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

export async function GET() {
  const authObject = await auth();
  const userId = authObject.userId;
  
  if (!userId) return NextResponse.json({ user: null }, { status: 200 });

  const { data: user } = await supabase
    .from('seofix_users')
    .select('id, email, github_username, github_avatar')
    .eq('id', userId)
    .single();

  return NextResponse.json({ user: user || null });
}
