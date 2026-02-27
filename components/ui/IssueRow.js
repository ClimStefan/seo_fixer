'use client';

/**
 * IssueRow
 * Renders one SEO issue. Layout:
 *   [badge] [title]                    [auto-fix badge]
 *   [description]
 *   [found value]
 *   [how to fix box]
 */
export default function IssueRow({ issue, index }) {
  const severityBadgeClass = {
    critical: 'badge badge-critical',
    warning:  'badge badge-warning',
    info:     'badge badge-info',
  }[issue.severity];

  const severityBorderClass = {
    critical: 'issue-critical',
    warning:  'issue-warning',
    info:     'issue-info',
  }[issue.severity];

  const severityLabel = {
    critical: 'Critical',
    warning:  'Warning',
    info:     'Info',
  }[issue.severity];

  return (
    <div
      className={`issue-row ${severityBorderClass}`}
      style={{
        flexDirection: 'column',
        gap: '10px',
        animationDelay: `${index * 0.05}s`,
      }}
    >
      {/* Row 1 — badge + title + auto-fix tag, all on one line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        {/* Severity badge */}
        <span className={severityBadgeClass} style={{ flexShrink: 0 }}>
          <span className="badge-dot" />
          {severityLabel}
        </span>

        {/* Issue title — takes remaining space */}
        <span className="issue-row-title" style={{ flex: 1, minWidth: '120px' }}>
          {issue.title}
        </span>

        {/* Auto-fix indicator — far right */}
        <span
          className={issue.canAutoFix ? 'badge badge-success' : 'badge badge-neutral'}
          style={{ flexShrink: 0 }}
          title={issue.canAutoFix
            ? 'This issue can be automatically fixed with the paid plan'
            : 'This issue requires your input to fix'}
        >
          {issue.canAutoFix ? 'Auto-fixable' : 'Manual fix'}
        </span>
      </div>

      {/* Row 2 — description */}
      <div className="issue-row-desc">{issue.description}</div>

      {/* Row 3 — current value found on page */}
      {issue.currentValue && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <span className="text-mono" style={{ flexShrink: 0 }}>Found:</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-2)',
              background: 'var(--surface2)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'inline-block',
            }}
            title={issue.currentValue}
          >
            {issue.currentValue.length > 100
              ? issue.currentValue.slice(0, 100) + '...'
              : issue.currentValue}
          </span>
        </div>
      )}

      {/* Row 4 — how to fix */}
      <div
        style={{
          padding: '10px 14px',
          background: 'var(--surface2)',
          borderRadius: '6px',
          border: '1px solid var(--border)',
        }}
      >
        <div className="text-label" style={{ marginBottom: '4px' }}>How to fix</div>
        <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.5' }}>
          {issue.recommendation}
        </div>
      </div>
    </div>
  );
}