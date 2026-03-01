/**
 * app/api/session/remove-fix/route.js
 *
 * Marks a fix as skipped so it won't appear in the PR.
 * Note: we cannot easily un-commit from GitHub, so we track this
 * in Supabase and exclude skipped fixes from the PR description.
 * The code change will still be in the branch but the PR description
 * will note which fixes were intentionally skipped.
 *
 * For a cleaner approach in the future, we could revert the specific
 * commit. For now, marking as skipped is sufficient.
 *
 * Body params:
 *   fixId — the UUID of the fix to remove
 */

import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session.js';
import { supabase } from '../../../../lib/supabase.js';

export async function POST(request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { fixId } = await request.json();
  if (!fixId) return NextResponse.json({ error: 'Missing fixId.' }, { status: 400 });

  // Verify the fix belongs to this user's session
  const { data: fix } = await supabase
    .from('seofix_fixes')
    .select('*, seofix_sessions!inner(user_id)')
    .eq('id', fixId)
    .single();

  if (!fix || fix.seofix_sessions.user_id !== user.id) {
    return NextResponse.json({ error: 'Fix not found.' }, { status: 404 });
  }

  const { error } = await supabase
    .from('seofix_fixes')
    .update({ status: 'skipped' })
    .eq('id', fixId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
