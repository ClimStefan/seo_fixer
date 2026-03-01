/**
 * lib/session.js — Session management
 *
 * We store the logged-in user's ID in a signed HTTP-only cookie.
 * HTTP-only means JavaScript in the browser cannot read it — only
 * the server can. This protects against XSS attacks stealing the session.
 *
 * The cookie contains just the user's UUID from the seofix_users table.
 * On each request we look up the full user record from Supabase using that ID.
 *
 * We sign the cookie value with NEXTAUTH_SECRET so it cannot be forged.
 * Signing means we append an HMAC hash — if anyone tampers with the cookie
 * value, the hash won't match and we reject it.
 */

import { cookies } from 'next/headers';
import { supabase } from './supabase.js';

const COOKIE_NAME = 'seofix_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days in seconds

/**
 * Creates a simple HMAC signature for the cookie value.
 * Uses the Web Crypto API which is available in Next.js edge/server environments.
 */
async function sign(value) {
  const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret-change-this';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${value}.${hashHex}`;
}

/**
 * Verifies and extracts the value from a signed cookie.
 * Returns null if the signature is invalid (tampered cookie).
 */
async function verify(signedValue) {
  if (!signedValue) return null;
  const lastDot = signedValue.lastIndexOf('.');
  if (lastDot === -1) return null;
  const value = signedValue.slice(0, lastDot);
  const expected = await sign(value);
  if (expected !== signedValue) return null;
  return value;
}

/**
 * Sets the session cookie after successful GitHub OAuth.
 * Called from the callback route after we create/update the user in Supabase.
 */
export async function setSession(userId) {
  const signed = await sign(userId);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signed, {
    httpOnly: true,        // JavaScript cannot read this cookie
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax',       // Protects against CSRF
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/**
 * Reads the session cookie and returns the full user record from Supabase.
 * Returns null if no session or invalid cookie.
 * This is called at the top of any API route that requires authentication.
 */
export async function getSession() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;

  const userId = await verify(cookie.value);
  if (!userId) return null;

  const { data: user, error } = await supabase
    .from('seofix_users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) return null;
  return user;
}

/**
 * Clears the session cookie — used for logout.
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
