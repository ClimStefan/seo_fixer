'use client';

/**
 * app/pricing/page.js — Pricing page
 *
 * Two plans:
 * 1. One-time audit — $19, single full site crawl + fix report, no subscription
 * 2. Monthly — $29/mo, one website, ongoing monitoring + auto PR fixes
 *
 * Both cards link to /connect for now (Stripe comes later).
 * The monthly plan is highlighted as the recommended option.
 */

import { useState } from 'react';
import Nav from '../../components/layout/Nav';
import Footer from '../../components/layout/Footer';

export default function PricingPage() {
  const [billingPeriod, setBillingPeriod] = useState('monthly'); // monthly | yearly

  const yearlyDiscount = 0.2; // 20% off yearly
  const monthlyPrice = 29;
  const yearlyMonthlyPrice = Math.round(monthlyPrice * (1 - yearlyDiscount));

  return (
    <div className="page-wrapper">
      <Nav />

      {/* ── HEADER ── */}
      <section style={{ padding: '72px 0 60px', textAlign: 'center' }}>
        <div className="container-sm">
          <div className="text-label" style={{ marginBottom: '12px' }}>Pricing</div>
          <h1 className="hero-title" style={{ fontSize: 'clamp(32px, 5vw, 52px)', marginBottom: '16px' }}>
            Simple pricing.<br />
            <span className="accent">No surprises.</span>
          </h1>
          <p className="hero-subtitle" style={{ marginBottom: '32px' }}>
            Start free. Pay only when you want the fixes.
          </p>

          {/* Billing toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '100px', padding: '4px' }}>
            <button
              onClick={() => setBillingPeriod('monthly')}
              style={{
                padding: '7px 20px',
                borderRadius: '100px',
                background: billingPeriod === 'monthly' ? 'var(--surface2)' : 'transparent',
                border: billingPeriod === 'monthly' ? '1px solid var(--border2)' : '1px solid transparent',
                color: billingPeriod === 'monthly' ? 'var(--white)' : 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              style={{
                padding: '7px 20px',
                borderRadius: '100px',
                background: billingPeriod === 'yearly' ? 'var(--surface2)' : 'transparent',
                border: billingPeriod === 'yearly' ? '1px solid var(--border2)' : '1px solid transparent',
                color: billingPeriod === 'yearly' ? 'var(--white)' : 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Yearly
              <span style={{ background: 'var(--green)', color: 'var(--bg)', padding: '1px 6px', borderRadius: '100px', fontSize: '10px', fontWeight: 700 }}>
                −20%
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* ── PRICING CARDS ── */}
      <section style={{ padding: '0 0 80px' }}>
        <div className="container">
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '20px',
            maxWidth: '960px',
            margin: '0 auto',
            alignItems: 'start',
          }}
          className="pricing-grid"
          >

            {/* FREE */}
            <PricingCard
              name="Free"
              price="$0"
              period="forever"
              description="Try it instantly. No account, no card, no catch."
              cta="Run a free audit"
              ctaHref="/"
              ctaVariant="secondary"
              features={[
                { text: 'Single page audit', included: true },
                { text: '10+ SEO checks', included: true },
                { text: 'Instant results', included: true },
                { text: 'Full site crawl', included: false },
                { text: 'GitHub PR creation', included: false },
                { text: 'Before/after diff review', included: false },
                { text: 'Ongoing monitoring', included: false },
              ]}
            />

            {/* ONE-TIME */}
            <PricingCard
              name="One-time audit"
              price="$19"
              period="one-time payment"
              description="Full site crawl and fix report. Pay once, use it when you need it."
              cta="Get started"
              ctaHref="/connect"
              ctaVariant="secondary"
              features={[
                { text: 'Single page audit', included: true },
                { text: '10+ SEO checks', included: true },
                { text: 'Instant results', included: true },
                { text: 'Full site crawl (up to 200 pages)', included: true },
                { text: 'GitHub PR creation', included: true },
                { text: 'Before/after diff review', included: true },
                { text: 'Ongoing monitoring', included: false },
              ]}
              badge="No subscription"
            />

            {/* MONTHLY */}
            <PricingCard
              name="Monthly"
              price={billingPeriod === 'monthly' ? `$${monthlyPrice}` : `$${yearlyMonthlyPrice}`}
              period={billingPeriod === 'monthly' ? 'per month' : 'per month, billed yearly'}
              description="One website. Continuous monitoring. Auto PRs whenever issues are found."
              cta="Start free trial"
              ctaHref="/connect"
              ctaVariant="primary"
              highlighted
              badge="Most popular"
              features={[
                { text: 'Single page audit', included: true },
                { text: '10+ SEO checks', included: true },
                { text: 'Instant results', included: true },
                { text: 'Full site crawl (up to 200 pages)', included: true },
                { text: 'GitHub PR creation', included: true },
                { text: 'Before/after diff review', included: true },
                { text: 'Monthly re-crawl + new issue alerts', included: true },
              ]}
            />

          </div>

          {/* Fine print */}
          <p style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', marginTop: '32px' }}>
            All plans include a 7-day free trial on first purchase. Cancel any time. Payments processed securely via Stripe.
          </p>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section style={{ padding: '0 0 80px', borderTop: '1px solid var(--border)' }}>
        <div className="container" style={{ maxWidth: '860px' }}>
          <div style={{ textAlign: 'center', padding: '60px 0 40px' }}>
            <div className="text-label" style={{ marginBottom: '10px' }}>Compare plans</div>
            <div className="text-h2">Everything in detail</div>
          </div>

          <ComparisonTable />
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ padding: '0 0 80px', borderTop: '1px solid var(--border)' }}>
        <div className="container-sm">
          <div style={{ textAlign: 'center', padding: '60px 0 40px' }}>
            <div className="text-label" style={{ marginBottom: '10px' }}>FAQ</div>
            <div className="text-h2">Common questions</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <FaqItem
              q="What's the difference between the one-time audit and the monthly plan?"
              a="The one-time audit gives you a full site crawl and the ability to create GitHub PRs for the issues found — but it's a snapshot in time. The monthly plan runs a fresh crawl every month, alerts you to new issues, and keeps your SEO clean on an ongoing basis."
            />
            <FaqItem
              q="Do I need to know how to code?"
              a="You need a GitHub repository for your site, which means some technical setup is involved. But once connected, SEOFix handles the heavy lifting — it detects the right files automatically and writes the fix. You just review the diff and click Merge."
            />
            <FaqItem
              q="Which frameworks does SEOFix support?"
              a="Any framework deployed on Vercel with a GitHub repository — Next.js, Astro, Remix, SvelteKit, Nuxt, plain HTML. We automatically detect the file structure and map URLs to source files."
            />
            <FaqItem
              q="Does SEOFix push directly to my main branch?"
              a="Never. Every fix is created as a pull request on a separate branch. You always review the changes before anything goes live. Your main branch is never touched without your approval."
            />
            <FaqItem
              q="What happens after I merge a PR?"
              a="If your site is deployed on Vercel, Vercel automatically detects the merge and deploys the new version. The fix is live in under 2 minutes with zero extra steps."
            />
            <FaqItem
              q="Can I cancel the monthly plan anytime?"
              a="Yes. Cancel anytime from your account settings. You keep access until the end of your billing period and are never charged again."
            />
            <FaqItem
              q="Is the one-time audit really one-time?"
              a="Yes — you pay $19, run your audit and fixes, and you're done. No recurring charges. If you want to run another audit later, you pay again. The monthly plan makes more sense if you want ongoing coverage."
            />
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: '72px 0 100px', borderTop: '1px solid var(--border)' }}>
        <div className="container-sm" style={{ textAlign: 'center' }}>
          <div className="text-h2" style={{ marginBottom: '12px' }}>
            Still not sure? Start free.
          </div>
          <div className="text-sm" style={{ marginBottom: '32px', maxWidth: '400px', margin: '0 auto 32px' }}>
            Run a free single-page audit right now — no account, no card.
            See the kind of issues we find before you commit to anything.
          </div>
          <a href="/" className="btn btn-primary btn-lg">
            Run a free audit →
          </a>
        </div>
      </section>

      <Footer />

      <style>{`
        @media (max-width: 900px) {
          .pricing-grid { grid-template-columns: 1fr !important; max-width: 480px !important; }
        }
        @media (max-width: 600px) {
          .pricing-grid { max-width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────
// PRICING CARD
// ─────────────────────────────────────────

function PricingCard({
  name, price, period, description,
  cta, ctaHref, ctaVariant,
  features, highlighted = false, badge,
}) {
  return (
    <div style={{
      background: highlighted
        ? 'linear-gradient(160deg, rgba(0,229,160,0.07) 0%, rgba(0,229,160,0.02) 100%)'
        : 'var(--surface)',
      border: highlighted ? '1px solid rgba(0,229,160,0.3)' : '1px solid var(--border)',
      borderRadius: '16px',
      padding: '28px 28px 32px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0',
      position: 'relative',
      // Slightly taller for the highlighted card
      ...(highlighted ? { boxShadow: '0 0 40px rgba(0,229,160,0.08)' } : {}),
    }}>

      {/* Badge */}
      {badge && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: highlighted ? 'var(--green)' : 'var(--surface2)',
          color: highlighted ? 'var(--bg)' : 'var(--text)',
          border: highlighted ? 'none' : '1px solid var(--border)',
          padding: '3px 12px',
          borderRadius: '100px',
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.5px',
          whiteSpace: 'nowrap',
        }}>
          {badge}
        </div>
      )}

      {/* Plan name */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 700,
        color: highlighted ? 'var(--green)' : 'var(--muted)',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        marginBottom: '16px',
      }}>
        {name}
      </div>

      {/* Price */}
      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <span style={{
          fontSize: '48px',
          fontWeight: 800,
          fontFamily: 'var(--font-sans)',
          color: 'var(--white)',
          lineHeight: 1,
          letterSpacing: '-2px',
        }}>
          {price}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: 'var(--muted)',
        marginBottom: '16px',
      }}>
        {period}
      </div>

      {/* Description */}
      <div className="text-sm" style={{ marginBottom: '24px', minHeight: '44px' }}>
        {description}
      </div>

      {/* CTA */}
      <a
        href={ctaHref}
        className={`btn btn-${ctaVariant} btn-md`}
        style={{ width: '100%', justifyContent: 'center', marginBottom: '28px' }}
      >
        {cta}
      </a>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)', marginBottom: '24px' }} />

      {/* Features */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {features.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: f.included
                ? (highlighted ? 'rgba(0,229,160,0.15)' : 'var(--surface2)')
                : 'transparent',
              border: f.included ? 'none' : '1px solid var(--border)',
            }}>
              {f.included ? (
                <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke={highlighted ? 'var(--green)' : 'var(--text)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: f.included ? 'var(--text)' : 'var(--muted)',
              opacity: f.included ? 1 : 0.5,
            }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// COMPARISON TABLE
// ─────────────────────────────────────────

function ComparisonTable() {
  const rows = [
    { category: 'Auditing', feature: 'Single page audit', free: true, oneTime: true, monthly: true },
    { category: 'Auditing', feature: 'Full site crawl (up to 200 pages)', free: false, oneTime: true, monthly: true },
    { category: 'Auditing', feature: '10+ SEO checks per page', free: true, oneTime: true, monthly: true },
    { category: 'Auditing', feature: 'Monthly re-crawl', free: false, oneTime: false, monthly: true },
    { category: 'Fixing', feature: 'GitHub repo connection', free: false, oneTime: true, monthly: true },
    { category: 'Fixing', feature: 'Auto file detection from URL', free: false, oneTime: true, monthly: true },
    { category: 'Fixing', feature: 'Batched fix sessions', free: false, oneTime: true, monthly: true },
    { category: 'Fixing', feature: 'Pull request creation', free: false, oneTime: true, monthly: true },
    { category: 'Fixing', feature: 'Before/after diff review', free: false, oneTime: true, monthly: true },
    { category: 'Monitoring', feature: 'New issue alerts via email', free: false, oneTime: false, monthly: true },
    { category: 'Monitoring', feature: 'Fix history', free: false, oneTime: false, monthly: true },
  ];

  const categories = [...new Set(rows.map(r => r.category))];

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 120px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>Feature</div>
        {['Free', 'One-time', 'Monthly'].map(plan => (
          <div key={plan} style={{ padding: '14px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: plan === 'Monthly' ? 'var(--green)' : 'var(--muted)', textAlign: 'center', fontWeight: plan === 'Monthly' ? 700 : 400 }}>
            {plan}
          </div>
        ))}
      </div>

      {/* Rows grouped by category */}
      {categories.map((cat, ci) => (
        <div key={cat}>
          {/* Category header */}
          <div style={{ padding: '10px 20px', background: 'var(--surface2)', borderTop: ci > 0 ? '1px solid var(--border)' : 'none' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {cat}
            </span>
          </div>
          {rows.filter(r => r.category === cat).map((row, ri) => (
            <div
              key={ri}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 120px 120px',
                borderTop: '1px solid var(--border)',
                background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
              }}
            >
              <div style={{ padding: '12px 20px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>
                {row.feature}
              </div>
              {[row.free, row.oneTime, row.monthly].map((val, vi) => (
                <div key={vi} style={{ padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {val ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" fill={vi === 2 ? 'rgba(0,229,160,0.15)' : 'var(--surface2)'} />
                      <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke={vi === 2 ? 'var(--green)' : 'var(--text-2)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M4 4l6 6M10 4l-6 6" stroke="var(--border2)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────
// FAQ ITEM
// ─────────────────────────────────────────

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 0',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '16px',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--white)', lineHeight: 1.4 }}>
          {q}
        </span>
        <span style={{
          color: 'var(--muted)',
          fontSize: '18px',
          flexShrink: 0,
          transition: 'transform 0.2s',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
          display: 'inline-block',
          lineHeight: 1,
        }}>
          +
        </span>
      </button>

      {open && (
        <div style={{
          paddingBottom: '20px',
          color: 'var(--text-2)',
          fontSize: '14px',
          lineHeight: '1.7',
          fontFamily: 'var(--font-sans)',
          maxWidth: '640px',
        }}>
          {a}
        </div>
      )}
    </div>
  );
}
