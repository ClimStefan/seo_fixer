import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  
  const authObject = await auth();
  const userId = authObject.userId;

  if (userId) {
    // Clear the GitHub token from Supabase
    await supabase
      .from('seofix_users')
      .update({ github_token: null, github_username: null, github_avatar: null })
      .eq('id', userId);
  }

  return NextResponse.redirect(appUrl + '/');
}