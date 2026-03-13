/**
 * app/api/crawl/start/route.js
 *
 * Creates a job record in Supabase then tells the Railway worker to start crawling.
 * Returns the jobId immediately so the frontend can start polling for progress.
 *
 * This route replaces the old inline crawl that would time out on Vercel.
 * Now Vercel just queues the job — Railway does all the heavy work.
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

const WORKER_URL = process.env.RAILWAY_WORKER_URL;       // e.g. https://seofix-worker.railway.app
const WORKER_SECRET = process.env.WORKER_SECRET;          // shared secret for auth

export async function POST(request) {
  const authObject = await auth();
  const userId = authObject.userId;
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

  const { domain, jobType = 'full_crawl' } = body;
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 });

  // Get the user's connected site
  const { data: site } = await supabase
    .from('seofix_sites')
    .select('id')
    .eq('user_id', userId)
    .single();

  // Create the job record in Supabase FIRST
  // The worker will update this record with progress as it runs
  const { data: job, error: jobError } = await supabase
    .from('seofix_jobs')
    .insert({
      user_id: userId,
      domain,
      site_id: site?.id || null,
      type: jobType,
      status: 'queued',
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
  }

  // Determine which Railway endpoint to call based on job type
  const endpointMap = {
    full_crawl: '/jobs/crawl',
    link_check: '/jobs/link-check',
    sitemap_check: '/jobs/sitemap-check',
    pagespeed: '/jobs/pagespeed',
  };

  const endpoint = endpointMap[jobType];
  if (!endpoint) {
    return NextResponse.json({ error: 'Unknown job type' }, { status: 400 });
  }

  // Tell the Railway worker to start — it responds immediately and runs in background
  try {
    const workerRes = await fetch(`${WORKER_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WORKER_SECRET}`,
      },
      body: JSON.stringify({
        jobId: job.id,
        userId,
        domain,
        siteId: site?.id || null,
      }),
    });

    if (!workerRes.ok) {
      // Worker rejected the request — mark job as failed
      await supabase
        .from('seofix_jobs')
        .update({ status: 'failed', error: 'Worker rejected job' })
        .eq('id', job.id);

      return NextResponse.json({ error: 'Worker unavailable' }, { status: 503 });
    }
  } catch (err) {
    // Worker unreachable — mark job as failed
    await supabase
      .from('seofix_jobs')
      .update({ status: 'failed', error: 'Could not reach worker' })
      .eq('id', job.id);

    return NextResponse.json({ error: 'Worker unreachable' }, { status: 503 });
  }

  // Return the jobId so the frontend can start polling /api/crawl/status
  return NextResponse.json({ jobId: job.id, status: 'queued' });
}
