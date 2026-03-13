/**
 * app/api/github/saved-repo/route.js
 * Returns the currently saved site/repo for the logged-in user.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

export async function GET() {
const { userId } = await auth();
if (!userId) return NextResponse.json({ site: null }, { status: 200 });

  const { data: site } = await supabase
    .from('seofix_sites')
    .select('*')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({ site: site || null });
}
