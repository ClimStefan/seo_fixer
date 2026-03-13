/**
 * app/api/crawl/status/route.js
 *
 * Frontend polls this every 3 seconds to check job progress.
 * Reads from seofix_jobs table — the Railway worker updates this as it crawls.
 *
 * Returns enough info for the UI to show:
 * - "Crawling... 47 / 200 pages"
 * - "Complete — 200 pages, 43 issues found"
 * - "Failed — could not reach site"
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

export async function GET(request) {
  const authObject = await auth();
  const userId = authObject.userId;
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });

  // Fetch the job — verify it belongs to this user
  const { data: job, error } = await supabase
    .from('seofix_jobs')
    .select('id, status, type, pages_found, pages_crawled, error, started_at, completed_at')
    .eq('id', jobId)
    .eq('user_id', userId)  // Security: users can only see their own jobs
    .single();

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // If complete, also fetch the scan results so frontend can display them
  let results = null;
  if (job.status === 'complete' && job.type === 'full_crawl') {
    const { data: scan } = await supabase
      .from('seofix_scans')
      .select('score, page_count, issue_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (scan) results = scan;
  }

  return NextResponse.json({ job, results });
}
