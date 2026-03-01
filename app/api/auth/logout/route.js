/**
 * app/api/auth/logout/route.js
 * Clears the session cookie and redirects to homepage.
 */

import { NextResponse } from 'next/server';
import { clearSession } from '../../../lib/session.js';

export async function GET() {
  await clearSession();
  return NextResponse.redirect(process.env.NEXT_PUBLIC_APP_URL + '/');
}
