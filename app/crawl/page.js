'use client';

/**
 * app/crawl/page.js — Full site crawl page
 *
 * This page lets users enter a domain and run a full site crawl.
 * It shows a live progress indicator while the crawl runs (via SSE),
 * then displays the complete site audit report when done.
 *
 * The page has three states:
 * 1. Idle — URL input form
 * 2. Crawling — live progress bar with phase and page count
 * 3. Complete — full site report with score, stats, and per-page issues
 */

import { useState } from 'react';
import Nav from '../../components/layout/Nav';
import Footer from '../../components/layout/Footer';
import IssueRow from '../../components/ui/IssueRow';
import { useCrawl } from '../../hooks/useCrawl';

// ─────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────

export default function CrawlPage() {
  const [url, setUrl] = useState('');
  const { startCrawl, reset, status, progress, result, error } = useCrawl();

  const isRunning = status === 'discovering' || status === 'auditing';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim() || isRunning) return;
    await startCrawl(url.trim());
  }

  function handleReset() {
    reset();
    setUrl('');
  }

  return (
    <div className="page-wrapper">
      <Nav />

      <div className="container" style={{ padding: '48px 32px 80px' }}>

        {/* ── PAGE HEADER ── */}
        <div style={{ marginBottom: '40px' }}>
          <div className="text-label" style={{ marginBottom: '8px' }}>Full site audit</div>
          <h1 className="text-h1" style={{ marginBottom: '10px' }}>
            Crawl your entire site
          </h1>
          <p className="text-sm" style={{ maxWidth: '520px' }}>
            Enter your domain and we will discover every page, audit each one,
            and give you a complete SEO health report. Up to 200 pages.
          </p>
        </div>

        {/* ── URL INPUT — shown when idle or after error ── */}
        {(status === 'idle' || status === 'error') && (
          <div style={{ maxWidth: '640px', marginBottom: '32px' }}>
            <form onSubmit={handleSubmit}>
              <label className="input-label">Website domain</label>
              <div className="search-bar">
                <input
                  className="input"
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={isRunning}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-md"
                  disabled={isRunning || !url.trim()}
                  style={{ margin: '6px', flexShrink: 0 }}
                >
                  Start crawl
                </button>
              </div>
              <p className="input-hint">
                We start from your homepage and follow every internal link. No login required.
              </p>
            </form>

            {error && (
              <div className="alert alert-error" style={{ marginTop: '16px' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── LIVE PROGRESS — shown while crawling ── */}
        {isRunning && (
          <CrawlProgress status={status} progress={progress} />
        )}

        {/* ── RESULTS — shown when complete ── */}
        {status === 'complete' && result && (
          <CrawlResults result={result} onReset={handleReset} />
        )}

      </div>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────
// CRAWL PROGRESS COMPONENT
// ─────────────────────────────────────────

/**
 * Shows a live progress indicator while the crawl is running.
 * Displays the current phase (discovering/auditing), page counts,
 * and a progress bar that fills as pages are audited.
 */
function CrawlProgress({ status, progress }) {
  const isDiscovering = status === 'discovering';
  const isAuditing = status === 'auditing';

  // Progress bar percentage — only meaningful during auditing phase
  const pct = isAuditing && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="card card-lg animate-fade-in" style={{ maxWidth: '640px' }}>
      {/* Phase indicator */}
      <div className="flex align-center gap-3" style={{ marginBottom: '20px' }}>
        <div className="spinner" />
        <div>
          <div className="text-h3" style={{ marginBottom: '2px' }}>
            {isDiscovering ? 'Discovering pages...' : `Auditing pages (${progress.current} / ${progress.total})`}
          </div>
          <div className="text-mono">{progress.message}</div>
        </div>
      </div>

      {/* Progress bar — only shown during audit phase */}
      {isAuditing && (
        <div style={{ marginBottom: '20px' }}>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div
            className="text-mono"
            style={{ marginTop: '6px', textAlign: 'right' }}
          >
            {pct}% complete
          </div>
        </div>
      )}

      {/* Phase steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <PhaseStep
          label="Discover pages"
          description="Following internal links to find all pages"
          done={isAuditing}
          active={isDiscovering}
        />
        <PhaseStep
          label="Audit each page"
          description="Running SEO checks on every discovered page"
          done={false}
          active={isAuditing}
        />
        <PhaseStep
          label="Generate report"
          description="Aggregating results into a site-level report"
          done={false}
          active={false}
        />
      </div>

      <div
        className="text-mono"
        style={{ marginTop: '20px', padding: '12px', background: 'var(--surface2)', borderRadius: '6px', border: '1px solid var(--border)' }}
      >
        This can take 1-5 minutes depending on your site size. Keep this tab open.
      </div>
    </div>
  );
}

function PhaseStep({ label, description, done, active }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 14px',
        borderRadius: '8px',
        background: active ? 'var(--surface2)' : 'transparent',
        border: `1px solid ${active ? 'var(--border2)' : 'transparent'}`,
        transition: 'all 0.2s ease',
      }}
    >
      {/* Status icon */}
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 700,
          background: done ? 'var(--green-dim)' : active ? 'var(--surface3)' : 'var(--surface2)',
          border: `1px solid ${done ? 'var(--green)' : active ? 'var(--border2)' : 'var(--border)'}`,
          color: done ? 'var(--green)' : 'var(--muted)',
        }}
      >
        {done ? '✓' : active ? <div className="spinner spinner-sm" /> : ''}
      </div>
      <div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: active ? 'var(--white)' : done ? 'var(--green)' : 'var(--muted)',
          }}
        >
          {label}
        </div>
        <div className="text-mono" style={{ fontSize: '11px' }}>{description}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// CRAWL RESULTS COMPONENT
// ─────────────────────────────────────────

/**
 * Displays the complete site audit report.
 * Shows site-level score, stats, top issues across the site,
 * then a list of all pages sorted by severity.
 * Each page is expandable to show its individual issues.
 */
function CrawlResults({ result, onReset }) {
  const [expandedPage, setExpandedPage] = useState(null);
  const [pageFilter, setPageFilter] = useState('all');

  // Filter pages based on health tab
  const filteredPages = result.pages.filter(page => {
    if (pageFilter === 'all') return true;
    if (pageFilter === 'critical') return page.counts.critical > 0;
    if (pageFilter === 'warning') return page.counts.warning > 0;
    if (pageFilter === 'healthy') return page.counts.total === 0;
    return true;
  });

  let scoreClass = 'score-good';
  if (result.siteScore < 50) scoreClass = 'score-bad';
  else if (result.siteScore < 75) scoreClass = 'score-ok';

  return (
    <div className="animate-fade-in">

      {/* ── SITE SUMMARY CARD ── */}
      <div className="card card-lg" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
          <div>
            <div className="text-label" style={{ marginBottom: '4px' }}>Site audit complete</div>
            <div className="text-h2" style={{ marginBottom: '4px' }}>{result.domain}</div>
            <div className="text-mono">
              {result.totalPages} pages crawled · {new Date(result.crawledAt).toLocaleString()}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onReset}>
            Crawl another site
          </button>
        </div>

        {/* Score + stats row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
          <div className={`score-circle ${scoreClass}`} style={{ flexShrink: 0 }}>
            <div className="score-circle-value">{result.siteScore}</div>
            <div className="score-circle-label">Site score</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', flex: 1, minWidth: '240px' }}>
            <div className="stat-box">
              <div className={`stat-value ${result.siteCounts.critical > 0 ? 'red' : ''}`}>
                {result.siteCounts.critical}
              </div>
              <div className="stat-label">Critical</div>
            </div>
            <div className="stat-box">
              <div className={`stat-value ${result.siteCounts.warning > 0 ? 'orange' : ''}`}>
                {result.siteCounts.warning}
              </div>
              <div className="stat-label">Warnings</div>
            </div>
            <div className="stat-box">
              <div className="stat-value">{result.siteCounts.info}</div>
              <div className="stat-label">Info</div>
            </div>
          </div>

          {/* Health breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '160px' }}>
            <HealthRow label="Healthy pages" value={result.healthBreakdown.healthy} color="var(--green)" total={result.successfulPages} />
            <HealthRow label="Needs work" value={result.healthBreakdown.needsWork} color="var(--orange)" total={result.successfulPages} />
            <HealthRow label="Poor health" value={result.healthBreakdown.poor} color="var(--red)" total={result.successfulPages} />
          </div>
        </div>

        {/* Page limit warning */}
        {result.hitPageLimit && (
          <div className="alert alert-warning" style={{ marginTop: '20px' }}>
            Page limit reached ({result.pageLimit} pages). Your site has more pages — upgrade to the full plan for unlimited crawling.
          </div>
        )}
      </div>

      {/* ── TOP ISSUES ACROSS SITE ── */}
      {result.topIssues.length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-title" style={{ marginBottom: '16px' }}>Most common issues across your site</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {result.topIssues.map(({ type, count }) => (
              <div
                key={type}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--surface2)',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>
                  {formatIssueType(type)}
                </span>
                <span className="badge badge-neutral">
                  {count} page{count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── PER-PAGE RESULTS ── */}
      <div>
        <div className="section-label" style={{ marginBottom: '16px' }}>
          <span className="text-label">Pages ({result.pages.length})</span>
        </div>

        {/* Page filter tabs */}
        <div className="filter-tabs" style={{ marginBottom: '16px', maxWidth: '500px' }}>
          {[
            { key: 'all', label: `All (${result.pages.length})` },
            { key: 'critical', label: `Critical (${result.pages.filter(p => p.counts.critical > 0).length})` },
            { key: 'warning', label: `Warnings (${result.pages.filter(p => p.counts.warning > 0).length})` },
            { key: 'healthy', label: `Healthy (${result.healthBreakdown.healthy})` },
          ].map(tab => (
            <button
              key={tab.key}
              className={`filter-tab ${pageFilter === tab.key ? 'active' : ''}`}
              onClick={() => { setPageFilter(tab.key); setExpandedPage(null); }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Page list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {filteredPages.map((page, idx) => (
            <PageRow
              key={page.url}
              page={page}
              isExpanded={expandedPage === page.url}
              onToggle={() => setExpandedPage(expandedPage === page.url ? null : page.url)}
            />
          ))}

          {filteredPages.length === 0 && (
            <div className="text-mono" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
              No pages match this filter.
            </div>
          )}
        </div>
      </div>

      {/* ── UPSELL ── */}
      <div
        className="card"
        style={{
          marginTop: '32px',
          padding: '28px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
          borderColor: 'var(--border2)',
        }}
      >
        <div>
          <div className="text-h3" style={{ marginBottom: '6px' }}>Want these fixed automatically?</div>
          <div className="text-sm">
            Connect your GitHub repo and SEOFix generates pull requests that fix your SEO issues.
          </div>
        </div>
        <div className="flex gap-3" style={{ flexShrink: 0 }}>
          <button className="btn btn-secondary btn-md" onClick={onReset}>
            Crawl another site
          </button>
          <a href="/signup" className="btn btn-primary btn-md">
            Fix automatically — from $29/mo
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// PAGE ROW — expandable per-page card
// ─────────────────────────────────────────

function PageRow({ page, isExpanded, onToggle }) {
  let scoreClass = 'score-good';
  if (page.score < 50) scoreClass = 'score-bad';
  else if (page.score < 75) scoreClass = 'score-ok';

  const scoreColor = page.score >= 80 ? 'var(--green)' : page.score >= 50 ? 'var(--orange)' : 'var(--red)';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${isExpanded ? 'var(--border2)' : 'var(--border)'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        transition: 'border-color 0.15s ease',
      }}
    >
      {/* Row header — always visible, click to expand */}
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '14px 18px',
          background: isExpanded ? 'var(--surface2)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.15s ease',
        }}
      >
        {/* Score number */}
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '20px',
            fontWeight: 800,
            color: scoreColor,
            width: '40px',
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {page.score}
        </div>

        {/* URL */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {page.url}
          </div>
          {page.meta?.title && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--muted)',
                marginTop: '2px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {page.meta.title}
            </div>
          )}
        </div>

        {/* Issue badges */}
        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {page.counts.critical > 0 && (
            <span className="badge badge-critical">{page.counts.critical} critical</span>
          )}
          {page.counts.warning > 0 && (
            <span className="badge badge-warning">{page.counts.warning} warning{page.counts.warning !== 1 ? 's' : ''}</span>
          )}
          {page.counts.info > 0 && (
            <span className="badge badge-info">{page.counts.info} info</span>
          )}
          {page.counts.total === 0 && (
            <span className="badge badge-success">Healthy</span>
          )}
        </div>

        {/* Expand chevron */}
        <div
          style={{
            color: 'var(--muted)',
            flexShrink: 0,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.2s ease',
            fontSize: '12px',
          }}
        >
          ▼
        </div>
      </button>

      {/* Expanded issues */}
      {isExpanded && page.issues.length > 0 && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--border)' }}>
          <div className="issue-list" style={{ marginTop: '12px' }}>
            {[...page.issues]
              .sort((a, b) => ['critical', 'warning', 'info'].indexOf(a.severity) - ['critical', 'warning', 'info'].indexOf(b.severity))
              .map((issue, idx) => (
                <IssueRow key={`${page.url}-${issue.id}`} issue={issue} index={idx} />
              ))
            }
          </div>
        </div>
      )}

      {isExpanded && page.issues.length === 0 && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid var(--border)' }}>
          <div className="alert alert-success">No SEO issues found on this page.</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function HealthRow({ label, value, color, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span className="text-mono" style={{ fontSize: '11px', flex: 1 }}>{label}</span>
      <span className="text-mono" style={{ fontSize: '11px', color: 'var(--text-2)' }}>{value} ({pct}%)</span>
    </div>
  );
}

// Converts snake_case issue types to readable labels
function formatIssueType(type) {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
