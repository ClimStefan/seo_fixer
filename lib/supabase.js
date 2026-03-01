/**
 * lib/supabase.js — Supabase client
 *
 * We use the service role key here because this file is only ever
 * imported in server-side API routes (never in client components).
 * The service role key bypasses RLS, which is what we want since
 * we are managing auth ourselves via GitHub OAuth + cookies,
 * not via Supabase Auth.
 *
 * NEVER import this file in any 'use client' component.
 */

import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
