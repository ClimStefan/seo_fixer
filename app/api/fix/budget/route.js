import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '../../../../lib/supabase.js';

export async function GET() {
  const authObject = await auth();
  const userId = authObject.userId;
  if (!userId) return NextResponse.json({ budget: null }, { status: 200 });

  const { data: purchase } = await supabase
    .from('seofix_purchases')
    .select('type, fixes_remaining, fixes_used, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!purchase) return NextResponse.json({ budget: null }, { status: 200 });

  return NextResponse.json({
    budget: {
      type: purchase.type,                          // 'one_time' or 'monthly'
      remaining: purchase.type === 'monthly' 
        ? null                                       // null means unlimited
        : purchase.fixes_remaining,
      used: purchase.fixes_used,
    }
  });
}