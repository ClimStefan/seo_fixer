/**
 * seofix-worker/index.js
 *
 * The main Express server that runs on Railway.
 * Receives job requests from Vercel, runs them in the background,
 * and updates Supabase with progress so the frontend can poll it.
 *
 * Security: every request must include the WORKER_SECRET header.
 * This prevents anyone from triggering crawls without going through Vercel.
 *
 * All jobs run asynchronously — we immediately return { jobId, status: 'queued' }
 * and process the job in the background. The frontend polls /status/:jobId
 * to check progress.
 */

import express from 'express';
import { runFullCrawl } from './app/jobs/fullCrawl.js';
import { runLinkCheck } from './app/jobs/linkCheck.js';
import { runSitemapCheck } from './app/jobs/sitemapCheck.js';
import { runPageSpeed } from './app/jobs/pageSpeed.js';
import { supabase } from './lib/supabase.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const WORKER_SECRET = process.env.WORKER_SECRET;

// ─────────────────────────────────────────
// AUTHENTICATION MIDDLEWARE
// Every route below requires the correct WORKER_SECRET header.
// Vercel sends this header with every request.
// Anyone who doesn't know the secret gets a 401.
// ─────────────────────────────────────────
function requireSecret(req, res, next) {
  const auth = req.headers['authorization'];
  const token = auth?.replace('Bearer ', '');

  if (!WORKER_SECRET || token !== WORKER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─────────────────────────────────────────
// HEALTH CHECK — Railway uses this to know the service is alive
// ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'seofix-worker', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────
// START FULL CRAWL
// Called by Vercel when user clicks "Start full crawl"
// Body: { jobId, userId, domain, siteId }
// ─────────────────────────────────────────
app.post('/jobs/crawl', requireSecret, async (req, res) => {
  const { jobId, userId, domain, siteId } = req.body;

  if (!jobId || !userId || !domain) {
    return res.status(400).json({ error: 'Missing required fields: jobId, userId, domain' });
  }

  // Respond immediately — don't make Vercel wait for the crawl to finish
  res.json({ jobId, status: 'started' });

  // Run the crawl in the background
  // Any errors are caught inside runFullCrawl and saved to Supabase
  runFullCrawl({ jobId, userId, domain, siteId }).catch(err => {
    console.error('Unhandled crawl error:', err);
  });
});

// ─────────────────────────────────────────
// START LINK CHECK
// Body: { jobId, userId, domain }
// ─────────────────────────────────────────
app.post('/jobs/link-check', requireSecret, async (req, res) => {
  const { jobId, userId, domain } = req.body;

  if (!jobId || !userId || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.json({ jobId, status: 'started' });

  runLinkCheck({ jobId, userId, domain }).catch(err => {
    console.error('Unhandled link check error:', err);
  });
});

// ─────────────────────────────────────────
// START SITEMAP CHECK
// Body: { jobId, userId, domain }
// ─────────────────────────────────────────
app.post('/jobs/sitemap-check', requireSecret, async (req, res) => {
  const { jobId, userId, domain } = req.body;

  if (!jobId || !userId || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.json({ jobId, status: 'started' });

  runSitemapCheck({ jobId, userId, domain }).catch(err => {
    console.error('Unhandled sitemap check error:', err);
  });
});

// ─────────────────────────────────────────
// START PAGESPEED CHECK
// Body: { jobId, userId, domain }
// ─────────────────────────────────────────
app.post('/jobs/pagespeed', requireSecret, async (req, res) => {
  const { jobId, userId, domain } = req.body;

  if (!jobId || !userId || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  res.json({ jobId, status: 'started' });

  runPageSpeed({ jobId, userId, domain }).catch(err => {
    console.error('Unhandled pagespeed error:', err);
  });
});

// ─────────────────────────────────────────
// JOB STATUS — Frontend polls this every 3 seconds
// Returns current progress so UI can show live counter
// ─────────────────────────────────────────
app.get('/jobs/:jobId/status', requireSecret, async (req, res) => {
  const { jobId } = req.params;

  const { data: job, error } = await supabase
    .from('seofix_jobs')
    .select('id, status, pages_found, pages_crawled, error, started_at, completed_at, type')
    .eq('id', jobId)
    .single();

  if (error || !job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

// ─────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`SEOFix worker running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
