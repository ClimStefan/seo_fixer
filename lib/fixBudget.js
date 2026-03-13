/**
 * lib/fixBudget.js
 *
 * Central logic for the fix credit system.
 *
 * One-time plan: 100 fixes, stored as fixes_remaining in seofix_purchases.
 *   Each successful Claude generation decrements by 1.
 *   When 0, the Fix button is disabled with an upgrade prompt.
 *
 * Monthly plan: fixes_remaining is NULL = unlimited.
 *   We still track fixes_used for analytics but never block.
 *
 * All functions use the service role Supabase client (server-side only).
 */

import { supabase } from './supabase.js';

export const ONE_TIME_FIX_LIMIT = 100;

/**
 * getActivePurchase(userId)
 *
 * Returns the user's active purchase record, or null if they have none.
 * Monthly takes priority over one-time if both exist somehow.
 */
export async function getActivePurchase(userId) {
  const { data, error } = await supabase
    .from('seofix_purchases')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error || !data || data.length === 0) return null;

  // Prefer monthly over one_time
  const monthly = data.find(p => p.type === 'monthly');
  return monthly || data[0];
}

/**
 * checkFixBudget(userId)
 *
 * Returns:
 *   { allowed: true, remaining: null }         — monthly, unlimited
 *   { allowed: true, remaining: 45 }           — one_time with budget left
 *   { allowed: false, remaining: 0 }           — one_time, budget exhausted
 *   { allowed: false, remaining: null, noPlan: true } — no active purchase
 */
export async function checkFixBudget(userId) {
  const purchase = await getActivePurchase(userId);

  if (!purchase) {
    return { allowed: false, remaining: null, noPlan: true };
  }

  // Monthly = unlimited
  if (purchase.type === 'monthly') {
    return { allowed: true, remaining: null, purchase };
  }

  // One-time — check remaining
  const remaining = purchase.fixes_remaining ?? ONE_TIME_FIX_LIMIT;

  if (remaining <= 0) {
    return { allowed: false, remaining: 0, purchase };
  }

  return { allowed: true, remaining, purchase };
}

/**
 * decrementFixBudget(purchaseId)
 *
 * Called AFTER a successful Claude fix generation.
 * Decrements fixes_remaining by 1 and increments fixes_used by 1.
 * No-ops for monthly plans (fixes_remaining is null).
 *
 * Returns the updated remaining count, or null for monthly.
 */
export async function decrementFixBudget(purchaseId) {
  // First fetch current values
  const { data: purchase } = await supabase
    .from('seofix_purchases')
    .select('type, fixes_remaining, fixes_used')
    .eq('id', purchaseId)
    .single();

  if (!purchase) return null;

  // Monthly = just increment uses, don't touch remaining
  if (purchase.type === 'monthly') {
    await supabase
      .from('seofix_purchases')
      .update({ fixes_used: (purchase.fixes_used || 0) + 1 })
      .eq('id', purchaseId);
    return null;
  }

  // One-time = decrement remaining, increment used
  const newRemaining = Math.max(0, (purchase.fixes_remaining ?? ONE_TIME_FIX_LIMIT) - 1);
  const newUsed = (purchase.fixes_used || 0) + 1;

  await supabase
    .from('seofix_purchases')
    .update({
      fixes_remaining: newRemaining,
      fixes_used: newUsed,
    })
    .eq('id', purchaseId);

  return newRemaining;
}

/**
 * createOneTimePurchase(userId, stripePaymentId)
 *
 * Called by the Stripe webhook when a one-time payment succeeds.
 * Creates the purchase record with full fix budget.
 */
export async function createOneTimePurchase(userId, stripePaymentId = null) {
  const { data, error } = await supabase
    .from('seofix_purchases')
    .insert({
      user_id: userId,
      type: 'one_time',
      status: 'active',
      fixes_remaining: ONE_TIME_FIX_LIMIT,
      fixes_used: 0,
      stripe_payment_id: stripePaymentId,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * createMonthlyPurchase(userId, stripeSubId, periodEnd)
 *
 * Called by the Stripe webhook when a subscription starts.
 */
export async function createMonthlyPurchase(userId, stripeSubId = null, periodEnd = null) {
  const { data, error } = await supabase
    .from('seofix_purchases')
    .insert({
      user_id: userId,
      type: 'monthly',
      status: 'active',
      fixes_remaining: null, // unlimited
      fixes_used: 0,
      stripe_sub_id: stripeSubId,
      current_period_end: periodEnd,
    })
    .select()
    .single();

  return { data, error };
}
