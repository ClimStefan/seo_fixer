# SEOFix Worker

Background job worker for SEOFix. Runs on Railway, handles heavy crawling tasks that would time out on Vercel.

## What it does
- Full site crawls (up to 500 pages, no timeout)
- Broken link detection (404s, redirect chains, HTTP→HTTPS)
- Sitemap parsing and cross-referencing
- PageSpeed / Core Web Vitals via Google's free API

## Setup

### 1. Add to Railway
In your Railway project, click **New Service → GitHub Repo**.
Select your `seo-fixer` repo and set the **Root Directory** to `seofix-worker`.

### 2. Add environment variables in Railway
See `.env.example` for the full list. Required:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `WORKER_SECRET` — generate with: `openssl rand -hex 32`

### 3. Run the Supabase migration
Copy `supabase-worker-migrations.sql` into Supabase SQL Editor and run it.

### 4. Add Vercel environment variables
- `RAILWAY_WORKER_URL` — your Railway public URL (e.g. https://seofix-worker.railway.app)
- `WORKER_SECRET` — same value as Railway

### 5. Add Vercel API routes
Copy these files into your Next.js project:
- `vercel-routes/crawl-start-route.js` → `app/api/crawl/start/route.js`
- `vercel-routes/crawl-status-route.js` → `app/api/crawl/status/route.js`

### 6. Test it
```bash
# Health check
curl https://your-worker.railway.app/health

# Start a crawl (replace values)
curl -X POST https://your-worker.railway.app/jobs/crawl \
  -H "Authorization: Bearer YOUR_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test-123","userId":"user_abc","domain":"example.com"}'
```

## Architecture
```
User clicks crawl → Vercel /api/crawl/start → Creates seofix_jobs row
                                             → POST Railway /jobs/crawl
                                             → Returns { jobId }

Frontend polls /api/crawl/status?jobId=xxx every 3 seconds
         ↓
Railway crawls pages → updates seofix_jobs.pages_crawled
                     → saves results to seofix_scans

Frontend sees status=complete → shows results
```
