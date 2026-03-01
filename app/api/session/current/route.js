/**
 * app/api/session/current/route.js
 *
 * Returns the current open session for the logged-in user,
 * including all fixes queued in it.
 * Used by the fixes dashboard and the crawl page to show fix count.
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ session: null }, { status: 200 });

  const { data: session } = await supabase
    .from('seofix_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!session) return NextResponse.json({ session: null });

  // Load all fixes for this session
  const { data: fixes } = await supabase
    .from('seofix_fixes')
    .select('*')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true });

  return NextResponse.json({ session, fixes: fixes || [] });
}
