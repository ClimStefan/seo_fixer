/**
 * seofix-worker/lib/jobUtils.js
 *
 * Helper functions for updating job status in Supabase.
 * Every job function calls these to keep the frontend
 * polling endpoint up to date with live progress.
 */

import { supabase } from './supabase.js';

/**
 * Marks a job as running and records the start time.
 * Called at the very beginning of any job function.
 */
export async function startJob(jobId) {
  await supabase
    .from('seofix_jobs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Updates the page counters so the frontend can show
 * live progress like "Crawling... 47/200 pages".
 *
 * @param {string} jobId
 * @param {number} found   — total pages discovered so far
 * @param {number} crawled — pages fully audited so far
 */
export async function updateProgress(jobId, found, crawled) {
  await supabase
    .from('seofix_jobs')
    .update({
      pages_found: found,
      pages_crawled: crawled,
    })
    .eq('id', jobId);
}

/**
 * Marks a job as successfully completed.
 */
export async function completeJob(jobId) {
  await supabase
    .from('seofix_jobs')
    .update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

/**
 * Marks a job as failed and stores the error message.
 * The frontend shows this error to the user.
 */
export async function failJob(jobId, errorMessage) {
  await supabase
    .from('seofix_jobs')
    .update({
      status: 'failed',
      error: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}
