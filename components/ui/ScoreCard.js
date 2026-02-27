'use client';

/**
 * ScoreCard
 * Displays the overall SEO health score as a circle,
 * plus stat boxes for critical / warning / info counts.
 *
 * Props:
 *   score   — number 0–100
 *   counts  — { critical, warning, info, total }
 *   meta    — { title, metaDescription, wordCount, imageCount }
 *   url     — the audited URL
 */
export default function ScoreCard({ score, counts, meta, url }) {
  // Score label and color class
  let scoreClass = 'score-good';
  let scoreLabel = 'Good';
  if (score < 50) { scoreClass = 'score-bad'; scoreLabel = 'Poor'; }
  else if (score < 75) { scoreClass = 'score-ok'; scoreLabel = 'Needs work'; }

  return (
    <div className="card card-lg animate-fade-in">
      {/* Header row */}
      <div style={{ marginBottom: '24px' }}>
        <div className="text-label" style={{ marginBottom: '6px' }}>Audit complete</div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {url}
        </div>
      </div>

      {/* Score + stats row */}
      <div className="flex align-center gap-8" style={{ flexWrap: 'wrap' }}>
        {/* Score circle */}
        <div className={`score-circle ${scoreClass}`} style={{ flexShrink: 0 }}>
          <div className="score-circle-value">{score}</div>
          <div className="score-circle-label">{scoreLabel}</div>
        </div>

        {/* Stat boxes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            flex: 1,
            minWidth: '240px',
          }}
        >
          <div className="stat-box">
            <div className={`stat-value ${counts.critical > 0 ? 'red' : ''}`}>
              {counts.critical}
            </div>
            <div className="stat-label">Critical</div>
          </div>
          <div className="stat-box">
            <div className={`stat-value ${counts.warning > 0 ? 'orange' : ''}`}>
              {counts.warning}
            </div>
            <div className="stat-label">Warnings</div>
          </div>
          <div className="stat-box">
            <div className="stat-value">{counts.info}</div>
            <div className="stat-label">Info</div>
          </div>
        </div>

        {/* Page meta */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minWidth: '180px',
            flexShrink: 0,
          }}
        >
          <MetaRow label="Page title" value={meta.title || 'Not found'} missing={!meta.title} />
          <MetaRow label="Word count" value={`~${meta.wordCount} words`} />
          <MetaRow label="Images" value={`${meta.imageCount} found`} />
        </div>
      </div>

      {/* Issues found summary */}
      {counts.total === 0 ? (
        <div className="alert alert-success" style={{ marginTop: '24px' }}>
          No issues found. This page has solid on-page SEO.
        </div>
      ) : (
        <div
          style={{
            marginTop: '24px',
            padding: '12px 16px',
            background: 'var(--surface2)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text-2)' }}>
            Found{' '}
            <span style={{ color: 'var(--white)', fontWeight: 700 }}>{counts.total} issue{counts.total !== 1 ? 's' : ''}</span>
            {' '}on this page.
            {counts.critical > 0 && (
              <span style={{ color: 'var(--red)' }}>
                {' '}{counts.critical} critical — fix these first.
              </span>
            )}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--muted)',
              flexShrink: 0,
            }}
          >
            {counts.total - counts.info} fixable automatically with paid plan
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value, missing }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '8px',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: missing ? 'var(--red)' : 'var(--text-2)',
          maxWidth: '160px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textAlign: 'right',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
