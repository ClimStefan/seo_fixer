/**
 * seofix-worker/lib/supabase.js
 *
 * Supabase client using the service role key.
 * The service role bypasses Row Level Security — safe to use
 * server-side since this worker is never exposed to the browser.
 */

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
