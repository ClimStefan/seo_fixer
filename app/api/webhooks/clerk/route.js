import { Webhook } from 'svix';
import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export async function POST(request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No webhook secret' }, { status: 500 });
  }

  // Get the headers Clerk sends for verification
  const svix_id        = request.headers.get('svix-id');
  const svix_timestamp = request.headers.get('svix-timestamp');
  const svix_signature = request.headers.get('svix-signature');

  const body = await request.text();

  // Verify the webhook is genuinely from Clerk
  const wh = new Webhook(WEBHOOK_SECRET);
  let event;
  try {
    event = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Only handle user creation
  if (event.type === 'user.created') {
    const { id, email_addresses, first_name, last_name } = event.data;

    const email = email_addresses?.[0]?.email_address || '';
    const name  = [first_name, last_name].filter(Boolean).join(' ') || '';

    await supabase.from('seofix_users').insert({
      id,       // Clerk userId is the primary key
      email,
      name,
    });
  }

  return NextResponse.json({ ok: true });
}