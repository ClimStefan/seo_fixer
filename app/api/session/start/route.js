/**
 * app/api/session/start/route.js
 *
 * Creates a new fix session for the current crawl.
 * A session represents one round of fixing — it has a single shared
 * branch in GitHub that all fixes in this session commit to.
 *
 * If the user already has an open session for this domain, we return
 * that existing session so fixes accumulate rather than starting fresh.
 *
 * Body params:
 *   domain — the site being audited e.g. "https://guardianofcompliance.com"
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function POST(request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { domain } = await request.json();
  if (!domain) return NextResponse.json({ error: 'Missing domain.' }, { status: 400 });

  // Check for existing open session for this domain
  const { data: existing } = await supabase
    .from('seofix_sessions')
    .select('*')
    .eq('user_id', user.id)
    .eq('domain', domain)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    return NextResponse.json({ session: existing });
  }

  // Create a new session with a unique branch name
  // Format: seofix/audit-YYYY-MM-DD-timestamp
  const date = new Date().toISOString().split('T')[0]; // "2024-03-01"
  const branchName = `seofix/audit-${date}-${Date.now()}`;

  const { data: session, error } = await supabase
    .from('seofix_sessions')
    .insert({
      user_id: user.id,
      domain,
      branch_name: branchName,
      status: 'open',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ session });
}
