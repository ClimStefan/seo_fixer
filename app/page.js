'use client';

/**
 * app/page.js — Home page
 *
 * This is the main page of SEOFix. It contains:
 * 1. The hero section with the URL input and audit trigger
 * 2. The results section that appears after the audit runs
 *
 * All state lives here. The audit is triggered by form submission,
 * which calls POST /api/audit, then renders the results below.
 *
 * We use 'use client' because this page manages state and handles events.
 * The API route itself runs on the server.
 */

import { useState, useRef } from 'react';
import Nav from '../components/layout/Nav';
import Footer from '../components/layout/Footer';
import ScoreCard from '../components/ui/ScoreCard';
import IssueRow from '../components/ui/IssueRow';

// The three severity levels in display order
const SEVERITY_ORDER = ['critical', 'warning', 'info'];
const FILTER_ALL = 'all';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [filter, setFilter] = useState(FILTER_ALL);

  const resultsRef = useRef(null);

  /**
   * Runs the audit. Called on form submit.
   * Posts to /api/audit, handles loading/error/result states,
   * then scrolls to the results section.
   */
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
        // Scroll to results after a short delay to let them render
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

  /**
   * Filtered issues based on the active tab.
   * 'all' shows everything sorted by severity (critical first).
   * Other values filter to just that severity.
   */
  const filteredIssues = result
    ? (filter === FILTER_ALL
        ? [...result.issues].sort(
            (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
          )
        : result.issues.filter(i => i.severity === filter)
      )
    : [];

  return (
    <div className="page-wrapper">
      <Nav />

      {/* ── HERO ── */}
      <section className="hero">
        <div className="container-sm">
          {/* Eyebrow pill */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div className="hero-eyebrow">
              Free audit — no account needed
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
            </div>
          </div>

          {/* Title */}
          <h1 className="hero-title">
            Audit your SEO.<br />
            <span className="accent">Fix it automatically.</span>
          </h1>

          {/* Subtitle */}
          <p className="hero-subtitle">
            Paste any URL and get a full SEO report in seconds.
            No jargon, no overwhelming dashboards — just clear issues and exact fixes.
          </p>

          {/* URL input */}
          <div className="hero-search">
            <form onSubmit={handleAudit}>
              <div className="search-bar">
                {/* Icon */}
                <div
                  style={{
                    padding: '0 0 0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--muted)',
                    flexShrink: 0,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>

                <input
                  className="input"
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={loading}
                  aria-label="Website URL to audit"
                />

                <button
                  type="submit"
                  className={`btn btn-primary btn-md ${loading ? 'btn-loading' : ''}`}
                  disabled={loading || !url.trim()}
                  style={{ margin: '6px', flexShrink: 0 }}
                >
                  {loading ? '' : 'Run audit'}
                </button>
              </div>
            </form>

            {/* Error message */}
            {error && (
              <div className="alert alert-error" style={{ marginTop: '12px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '1px' }}>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginTop: '12px',
                  padding: '12px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--muted)',
                }}
              >
                <div className="spinner spinner-sm" />
                Fetching page and running SEO checks...
              </div>
            )}
          </div>

          {/* Trust line */}
          {!result && !loading && (
            <p
              style={{
                marginTop: '20px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--muted)',
                textAlign: 'center',
              }}
            >
              Checks title, meta, canonicals, H1, images, schema, viewport & more.
            </p>
          )}

          {/* Waitlist inline — shown below audit bar when no results */}
          {!result && !loading && (
            <WaitlistInline />
          )}
        </div>
      </section>

      {/* ── RESULTS ── */}
      {result && (
        <section
          ref={resultsRef}
          style={{ padding: '0 0 80px', scrollMarginTop: '80px' }}
          className="animate-fade-in"
        >
          <div className="container">
            {/* Score card */}
            <ScoreCard
              score={result.score}
              counts={result.counts}
              meta={result.meta}
              url={result.finalUrl}
            />

            {/* Issues section */}
            {result.issues.length > 0 && (
              <div style={{ marginTop: '32px' }}>
                {/* Section label */}
                <div className="section-label" style={{ marginBottom: '20px' }}>
                  <span className="text-label">Issues found</span>
                </div>

                {/* Filter tabs */}
                <div className="filter-tabs" style={{ marginBottom: '16px' }}>
                  <button
                    className={`filter-tab ${filter === FILTER_ALL ? 'active' : ''}`}
                    onClick={() => setFilter(FILTER_ALL)}
                  >
                    All ({result.counts.total})
                  </button>
                  <button
                    className={`filter-tab ${filter === 'critical' ? 'active critical' : ''}`}
                    onClick={() => setFilter('critical')}
                    disabled={result.counts.critical === 0}
                  >
                    Critical ({result.counts.critical})
                  </button>
                  <button
                    className={`filter-tab ${filter === 'warning' ? 'active warning' : ''}`}
                    onClick={() => setFilter('warning')}
                    disabled={result.counts.warning === 0}
                  >
                    Warnings ({result.counts.warning})
                  </button>
                  <button
                    className={`filter-tab ${filter === 'info' ? 'active info' : ''}`}
                    onClick={() => setFilter('info')}
                    disabled={result.counts.info === 0}
                  >
                    Info ({result.counts.info})
                  </button>
                </div>

                {/* Issue list */}
                <div className="issue-list stagger">
                  {filteredIssues.map((issue, idx) => (
                    <IssueRow key={issue.id} issue={issue} index={idx} />
                  ))}
                </div>

                {/* Upsell block — shown at bottom of results */}
                <div
                  className="card"
                  style={{
                    marginTop: '24px',
                    padding: '28px 32px',
                    borderColor: 'var(--border2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '24px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div className="text-h3" style={{ marginBottom: '6px' }}>
                      Want these fixed automatically?
                    </div>
                    <div className="text-sm">
                      Connect your GitHub repo and let SEOFix generate pull requests that fix your SEO issues.
                      No technical knowledge required.
                    </div>
                  </div>
                  <div className="flex gap-3" style={{ flexShrink: 0 }}>
                    <button
                      className="btn btn-secondary btn-md"
                      onClick={() => {
                        setResult(null);
                        setUrl('');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      Audit another page
                    </button>
                    <a href="/signup" className="btn btn-primary btn-md">
                      Fix automatically — from $29/mo
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* No issues state */}
            {result.issues.length === 0 && (
              <div style={{ marginTop: '32px' }}>
                <div className="alert alert-success">
                  No SEO issues detected on this page. 
                  Consider auditing more pages on your site to find any hidden issues.
                </div>
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                  <button
                    className="btn btn-secondary btn-md"
                    onClick={() => {
                      setResult(null);
                      setUrl('');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Audit another page
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── HOW IT WORKS — shown only before results ── */}
      {!result && !loading && (
        <section style={{ padding: '60px 0 80px', borderTop: '1px solid var(--border)' }}>
          <div className="container">
            <div className="section-label" style={{ marginBottom: '32px' }}>
              <span className="text-label">How it works</span>
            </div>
            <div className="grid-3">
              <HowItWorksStep
                number="01"
                title="Paste your URL"
                description="Enter any public URL. No login required. We fetch the page and analyze the HTML directly."
              />
              <HowItWorksStep
                number="02"
                title="Get your audit"
                description="We check 10+ SEO signals: title, meta, canonicals, H1, images, schema, viewport, and more."
              />
              <HowItWorksStep
                number="03"
                title="Fix automatically"
                description="With the paid plan, connect your GitHub repo and we generate pull requests to fix issues for you."
              />
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}


/**
 * WaitlistInline
 * Email capture shown below the hero search bar.
 * Submits to Web3Forms — no backend needed.
 * Replace YOUR_WEB3FORMS_KEY with your key from web3forms.com/dashboard.
 */
function WaitlistInline() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
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
          access_key: '0e657581-2f78-495f-8adb-452c1c2bce9b',
          subject: 'SEOFix — New early access request',
          from_name: 'SEOFix Waitlist',
          email: email.trim(),
          message: `New early access signup: ${email.trim()}`,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg('Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please check your connection.');
    }
  }

  return (
    <div
      style={{
        marginTop: '40px',
        padding: '28px 32px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        textAlign: 'center',
      }}
    >
      <div className="text-label" style={{ marginBottom: '8px' }}>Early access</div>
      <div className="text-h3" style={{ marginBottom: '6px', color: 'var(--white)' }}>
        Launching soon — get notified first
      </div>
      <div className="text-sm" style={{ marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
        Leave your email and we will reach out when early access opens, including a founding discount.
      </div>

      {status === 'success' ? (
        <div className="alert alert-success" style={{ maxWidth: '400px', margin: '0 auto', justifyContent: 'center' }}>
          You are on the list. We will be in touch soon.
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ maxWidth: '400px', margin: '0 auto' }}>
          <div className="search-bar">
            <input
              className="input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              disabled={status === 'loading'}
            />
            <button
              type="submit"
              className={`btn btn-primary btn-md ${status === 'loading' ? 'btn-loading' : ''}`}
              disabled={status === 'loading' || !email.trim()}
              style={{ margin: '6px', flexShrink: 0 }}
            >
              {status === 'loading' ? '' : 'Join the waitlist'}
            </button>
          </div>
          {status === 'error' && (
            <div className="alert alert-error" style={{ marginTop: '10px' }}>{errorMsg}</div>
          )}
          <div className="text-mono" style={{ marginTop: '10px' }}>
            No spam. Unsubscribe any time.
          </div>
        </form>
      )}
    </div>
  );
}

function HowItWorksStep({ number, title, description }) {
  return (
    <div className="card card-hover">
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 700,
          color: 'var(--green)',
          letterSpacing: '1px',
          marginBottom: '10px',
        }}
      >
        {number}
      </div>
      <div className="text-h3" style={{ marginBottom: '8px' }}>{title}</div>
      <div className="text-sm">{description}</div>
    </div>
  );
}