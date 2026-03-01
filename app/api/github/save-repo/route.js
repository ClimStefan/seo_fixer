/**
 * app/api/github/save-repo/route.js
 *
 * Saves the user's selected GitHub repo and domain to seofix_sites.
 * If they already have a site saved, we update it.
 * One user = one site for now. Multiple sites comes with the paid plan.
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function POST(request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { domain, github_repo, github_owner, github_branch } = body;

  if (!domain || !github_repo || !github_owner) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  // Check if user already has a site record
  const { data: existing } = await supabase
    .from('seofix_sites')
    .select('id')
    .eq('user_id', user.id)
    .single();

  let site;
  if (existing) {
    // Update existing record
    const { data, error } = await supabase
      .from('seofix_sites')
      .update({ domain, github_repo, github_owner, github_branch })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    site = data;
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from('seofix_sites')
      .insert({ user_id: user.id, domain, github_repo, github_owner, github_branch })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    site = data;
  }

  return NextResponse.json({ site });
}
