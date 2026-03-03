'use client';

import { useState, useRef } from 'react';
import Nav from '../components/layout/Nav';
import Footer from '../components/layout/Footer';
import ScoreCard from '../components/ui/ScoreCard';
import IssueRow from '../components/ui/IssueRow';

const SEVERITY_ORDER = ['critical', 'warning', 'info'];
const FILTER_ALL = 'all';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState(FILTER_ALL);
  const resultsRef = useRef(null);

  async function handleAudit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setFilter(FILTER_ALL);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Something went wrong. Please try again.');
      } else {
        setResult(data);
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  const filteredIssues = result
    ? (filter === FILTER_ALL
        ? [...result.issues].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
        : result.issues.filter(i => i.severity === filter))
    : [];

  return (
    <div className="page-wrapper">
      <Nav />

      {/* ── HERO ── */}
      <section className="hero" style={{ paddingBottom: '40px' }}>
        <div className="container-sm">

          {/* For founders badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '6px 14px',
              background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)',
              borderRadius: '100px', fontFamily: 'var(--font-mono)', fontSize: '11px',
              color: 'var(--green)', letterSpacing: '0.5px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', flexShrink: 0 }} />
              BUILT FOR INDIE FOUNDERS & SOLO BUILDERS
            </div>
          </div>

          <h1 className="hero-title">
            Audit your SEO.<br />
            <span className="accent">Fix it automatically.</span>
          </h1>

          <p className="hero-subtitle">
            SEOFix audits your site, finds every issue, and opens a GitHub pull request
            with the fix already written. You review, merge, done.
          </p>

          <div className="hero-search">
            <form onSubmit={handleAudit}>
              <div className="search-bar">
                <div style={{ padding: '0 0 0 16px', display: 'flex', alignItems: 'center', color: 'var(--muted)', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <input
                  className="input" type="text" value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  spellCheck={false} autoComplete="off" disabled={loading}
                  aria-label="Website URL to audit"
                />
                <button
                  type="submit"
                  className={`btn btn-primary btn-md ${loading ? 'btn-loading' : ''}`}
                  disabled={loading || !url.trim()} style={{ margin: '6px', flexShrink: 0 }}
                >
                  {loading ? '' : 'Run free audit'}
                </button>
              </div>
            </form>

            {error && (
              <div className="alert alert-error" style={{ marginTop: '12px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)' }}>
                <div className="spinner spinner-sm" />
                Fetching page and running SEO checks...
              </div>
            )}
          </div>

          {!result && !loading && (
            <p style={{ marginTop: '14px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>
              Free, no account needed · Checks 10+ SEO signals · Results in seconds
            </p>
          )}
        </div>
      </section>

      {/* ── RESULTS ── */}
      {result && (
        <section ref={resultsRef} style={{ padding: '0 0 80px', scrollMarginTop: '80px' }} className="animate-fade-in">
          <div className="container">
            <ScoreCard score={result.score} counts={result.counts} meta={result.meta} url={result.finalUrl} />
            {result.issues.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div className="text-label">Issues found</div>
                  <div className="filter-tabs">
                    <button className={`filter-tab ${filter === FILTER_ALL ? 'active' : ''}`} onClick={() => setFilter(FILTER_ALL)}>All ({result.issues.length})</button>
                    <button className={`filter-tab ${filter === 'critical' ? 'active critical' : ''}`} onClick={() => setFilter('critical')} disabled={result.counts.critical === 0}>Critical ({result.counts.critical})</button>
                    <button className={`filter-tab ${filter === 'warning' ? 'active warning' : ''}`} onClick={() => setFilter('warning')} disabled={result.counts.warning === 0}>Warning ({result.counts.warning})</button>
                    <button className={`filter-tab ${filter === 'info' ? 'active info' : ''}`} onClick={() => setFilter('info')} disabled={result.counts.info === 0}>Info ({result.counts.info})</button>
                  </div>
                </div>
                <div className="issue-list stagger">
                  {filteredIssues.map((issue, idx) => (
                    <IssueRow key={issue.id} issue={issue} index={idx} />
                  ))}
                </div>
                <div className="card" style={{ marginTop: '24px', padding: '28px 32px', borderColor: 'var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
                  <div>
                    <div className="text-h3" style={{ marginBottom: '6px' }}>Want these fixed automatically?</div>
                    <div className="text-sm">Connect your GitHub repo and SEOFix generates pull requests that fix your SEO issues. You just review and merge.</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary btn-md" onClick={() => { setResult(null); setUrl(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Audit another page</button>
                    <a href="/connect" className="btn btn-primary btn-md">Fix automatically →</a>
                  </div>
                </div>
              </div>
            )}
            {result.issues.length === 0 && (
              <div style={{ marginTop: '32px' }}>
                <div className="alert alert-success">No SEO issues detected on this page.</div>
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                  <button className="btn btn-secondary btn-md" onClick={() => { setResult(null); setUrl(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Audit another page</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── REST OF PAGE — only when no results ── */}
      {!result && !loading && (
        <>

          {/* ── HOW IT WORKS ── */}
          <section style={{ padding: '72px 0 80px', borderTop: '1px solid var(--border)' }}>
            <div className="container">
              <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                <div className="text-label" style={{ marginBottom: '10px' }}>How it works</div>
                <div className="text-h2" style={{ marginBottom: '12px' }}>From broken SEO to merged fix in minutes</div>
                <div className="text-sm" style={{ maxWidth: '480px', margin: '0 auto' }}>
                  No agencies. No $500/month tools. No waiting weeks for a developer.
                </div>
              </div>

              {/* Steps 1 + 2 — side by side cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }} className="steps-grid">

                {/* STEP 1 */}
                <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--green)', letterSpacing: '1px', marginBottom: '10px' }}>01</div>
                    <div className="text-h3" style={{ marginBottom: '8px' }}>Paste your URL — get your audit</div>
                    <div className="text-sm">We crawl your full site and check every page for 10+ SEO signals: title, meta, canonicals, H1, images, schema, Open Graph and more. Results in under 2 minutes.</div>
                  </div>
                  {/* ↓ STEP 1 IMAGE — replace the src value with your screenshot path */}
                  <img
                    src="/screenshots/s1.jpg"
                    alt="Full site crawl results"
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }}
                  />
                </div>

                {/* STEP 2 */}
                <div className="card card-hover" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--green)', letterSpacing: '1px', marginBottom: '10px' }}>02</div>
                    <div className="text-h3" style={{ marginBottom: '8px' }}>Connect your GitHub repo</div>
                    <div className="text-sm">One-click OAuth. We detect your framework and automatically map each live URL to the exact file in your codebase. No manual file paths.</div>
                  </div>
                  {/* ↓ STEP 2 IMAGE — replace the src value with your screenshot path */}
                  <img
                    src="/screenshots/s2.jpg"
                    alt="GitHub repo connection and file detection"
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }}
                  />
                </div>

              </div>

              {/* Step 3 — full width hero panel */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(0,229,160,0.06) 0%, rgba(0,229,160,0.02) 100%)',
                border: '1px solid rgba(0,229,160,0.2)',
                borderRadius: '16px', padding: '40px 48px',
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: '48px', alignItems: 'center',
              }} className="step3-card">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--green)', letterSpacing: '1px', marginBottom: '16px' }}>
                    03 — THE PART THAT'S DIFFERENT
                  </div>
                  <div className="text-h2" style={{ marginBottom: '16px', lineHeight: '1.2' }}>
                    One click.<br />
                    <span style={{ color: 'var(--green)' }}>Real pull request.</span><br />
                    Already on GitHub.
                  </div>
                  <div className="text-sm" style={{ marginBottom: '24px', lineHeight: '1.8' }}>
                    SEOFix doesn't just tell you what's wrong — it opens a PR with the fix written in your code.
                    You review the diff, see exactly what changed, and merge with confidence.
                    Vercel deploys automatically. Done.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      'Fix 20 issues across your site — one PR, one review',
                      'See before/after diff of every change before merging',
                      'Never touches main directly — always a reviewable PR',
                      'Works with any Vercel-deployed repo',
                    ].map((point, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{ color: 'var(--green)', flexShrink: 0, fontSize: '13px', marginTop: '2px' }}>✓</div>
                        <div className="text-sm">{point}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ↓ STEP 3 IMAGE — replace the src value with your screenshot path */}
                <img
                  src="/screenshots/s3.jpg"
                  alt="GitHub PR with SEO fixes, diff view ready to merge"
                  style={{ width: '100%', borderRadius: '10px', border: '1px solid rgba(0,229,160,0.2)', display: 'block', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
                />

              </div>
            </div>
          </section>

          {/* ── FOR FOUNDERS ── */}
          <section style={{ padding: '72px 0 80px', borderTop: '1px solid var(--border)' }}>
            <div className="container">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center' }} className="founders-grid">
                <div>
                  <div className="text-label" style={{ marginBottom: '12px' }}>Built for founders</div>
                  <div className="text-h2" style={{ marginBottom: '16px', lineHeight: '1.2' }}>
                    You're building the product.<br />
                    SEO shouldn't take a week.
                  </div>
                  <div className="text-sm" style={{ marginBottom: '28px', lineHeight: '1.8' }}>
                    You know SEO matters. You've been putting it off because every tool
                    gives you a 47-page report and zero actual help. SEOFix is different —
                    it's built for solo founders who want the fix, not the homework.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    <FounderPoint icon="" title="No agency required" desc="You don't need to hire someone. The PR is ready to review in minutes." />
                    <FounderPoint icon="" title="No guessing what to fix" desc="Every issue has a clear explanation and an exact recommended fix." />
                    <FounderPoint icon="" title="Deployed in one merge" desc="Merge the PR, Vercel deploys. No FTP, no servers, no drama." />
                  </div>
                  <WaitlistInline compact />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* ↓ FOUNDERS IMAGE 1 — replace the src value with your screenshot path */}
                  <img
                    src="/screenshots/s4.jpg"
                    alt="Issue list with Fix this button"
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }}
                  />
                  {/* ↓ FOUNDERS IMAGE 2 — replace the src value with your screenshot path */}
                  <img
                    src="/screenshots/s5.jpg"
                    alt="Fix panel with before and after diff"
                    style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── FLOW STRIP — 4 steps ── */}
          <section style={{ padding: '72px 0 80px', borderTop: '1px solid var(--border)' }}>
            <div className="container">
              <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                <div className="text-label" style={{ marginBottom: '10px' }}>See it in action</div>
                <div className="text-h2">The full flow, start to finish</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="flow-grid">

                {/* ↓ FLOW IMAGE 1 — replace the src value with your screenshot path */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <img src="/screenshots/sw1.jpg" alt="Crawl your site" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--bg)' }}>1</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>Crawl your site</span>
                  </div>
                </div>

                {/* ↓ FLOW IMAGE 2 — replace the src value with your screenshot path */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <img src="/screenshots/sw2.jpg" alt="See every issue" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--bg)' }}>2</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>See every issue</span>
                  </div>
                </div>

                {/* ↓ FLOW IMAGE 3 — replace the src value with your screenshot path */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <img src="/screenshots/sw3.jpg" alt="Review the fix" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--bg)' }}>3</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>Review the fix</span>
                  </div>
                </div>

                {/* ↓ FLOW IMAGE 4 — replace the src value with your screenshot path */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <img src="/screenshots/sw4.jpg" alt="Merge the PR" style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--border)', display: 'block' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--bg)' }}>4</span>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>Merge the PR</span>
                  </div>
                </div>

              </div>
            </div>
          </section>

          {/* ── FINAL CTA ── */}
          <section style={{ padding: '72px 0 100px', borderTop: '1px solid var(--border)' }}>
            <div className="container-sm" style={{ textAlign: 'center' }}>
              <div className="text-label" style={{ marginBottom: '12px' }}>Early access</div>
              <div className="text-h1" style={{ marginBottom: '16px' }}>Ready to stop ignoring your SEO?</div>
              <div className="text-sm" style={{ marginBottom: '40px', maxWidth: '440px', margin: '0 auto 40px' }}>
                Start with a free audit — no account needed.
                Or join the waitlist for early access to the full fix + PR flow.
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '40px' }}>
                <button className="btn btn-primary btn-lg" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                  Run a free audit
                </button>
                <a href="/crawl" className="btn btn-secondary btn-lg">Crawl full site</a>
              </div>
              <WaitlistInline compact />
            </div>
          </section>

        </>
      )}

      <Footer />

      <style>{`
        @media (max-width: 768px) {
          .step3-card { grid-template-columns: 1fr !important; }
          .founders-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .flow-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function FounderPoint({ icon, title, desc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
      <div style={{ fontSize: '20px', flexShrink: 0, marginTop: '1px' }}>{icon}</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', marginBottom: '3px' }}>{title}</div>
        <div className="text-sm">{desc}</div>
      </div>
    </div>
  );
}

function WaitlistInline({ compact = false }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: 'YOUR_WEB3FORMS_KEY',
          subject: 'SEOFix — New early access request',
          from_name: 'SEOFix Waitlist',
          email: email.trim(),
          message: `New early access signup: ${email.trim()}`,
        }),
      });
      const data = await res.json();
      if (data.success) { setStatus('success'); }
      else { setStatus('error'); setErrorMsg('Something went wrong. Please try again.'); }
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
    }
  }

  if (compact) {
    return (
      <div>
        {status === 'success' ? (
          <div className="alert alert-success">You are on the list. We will be in touch soon.</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="search-bar" style={{ maxWidth: '420px' }}>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required disabled={status === 'loading'} />
              <button type="submit" className={`btn btn-primary btn-md ${status === 'loading' ? 'btn-loading' : ''}`} disabled={status === 'loading' || !email.trim()} style={{ margin: '6px', flexShrink: 0 }}>
                {status === 'loading' ? '' : 'Get early access'}
              </button>
            </div>
            {status === 'error' && <div className="alert alert-error" style={{ marginTop: '8px' }}>{errorMsg}</div>}
            <div className="text-mono" style={{ marginTop: '8px', fontSize: '11px' }}>No spam. Unsubscribe any time.</div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: '40px', padding: '28px 32px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', textAlign: 'center' }}>
      <div className="text-label" style={{ marginBottom: '8px' }}>Early access</div>
      <div className="text-h3" style={{ marginBottom: '6px', color: 'var(--white)' }}>Launching soon — get notified first</div>
      <div className="text-sm" style={{ marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
        Leave your email and we will reach out when early access opens, including a founding discount.
      </div>
      {status === 'success' ? (
        <div className="alert alert-success" style={{ maxWidth: '400px', margin: '0 auto', justifyContent: 'center' }}>You are on the list. We will be in touch soon.</div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: '400px', margin: '0 auto' }}>
          <div className="search-bar">
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required disabled={status === 'loading'} />
            <button type="submit" className={`btn btn-primary btn-md ${status === 'loading' ? 'btn-loading' : ''}`} disabled={status === 'loading' || !email.trim()} style={{ margin: '6px', flexShrink: 0 }}>
              {status === 'loading' ? '' : 'Get early access'}
            </button>
          </div>
          {status === 'error' && <div className="alert alert-error" style={{ marginTop: '10px' }}>{errorMsg}</div>}
          <div className="text-mono" style={{ marginTop: '10px' }}>No spam. Unsubscribe any time.</div>
        </form>
      )}
    </div>
  );
}