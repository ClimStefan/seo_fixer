'use client';

/**
 * components/ui/DiffViewer.js — Side by side diff viewer
 *
 * Shows the original file content on the left and the fixed content on the right.
 * Lines that changed are highlighted in red (removed) on the left
 * and green (added) on the right.
 *
 * We compute the diff ourselves using a simple line-by-line comparison —
 * no external diff library needed. For most SEO fixes (changing a title,
 * adding a meta tag, changing h2 to h1) the diffs are small and simple
 * enough that a line-by-line approach works perfectly.
 *
 * Props:
 *   original  — the file content before the fix
 *   fixed     — the file content after the fix
 *   filePath  — shown in the header
 */

import { useState } from 'react';

export default function DiffViewer({ original, fixed, filePath, onClose }) {
  const [view, setView] = useState('split'); // 'split' | 'unified'

  if (!original || !fixed) {
    return (
      <div className="alert alert-warning">
        Original content not available for comparison.
      </div>
    );
  }

  const originalLines = original.split('\n');
  const fixedLines = fixed.split('\n');
  const diff = computeDiff(originalLines, fixedLines);

  const hasChanges = diff.some(d => d.type !== 'unchanged');
  const changedCount = diff.filter(d => d.type !== 'unchanged').length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--surface)',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div className="text-label" style={{ marginBottom: '2px' }}>Reviewing changes</div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>
              {filePath}
            </code>
          </div>
          {hasChanges && (
            <span className="badge badge-success">
              {changedCount} line{changedCount !== 1 ? 's' : ''} changed
            </span>
          )}
          {!hasChanges && (
            <span className="badge badge-neutral">No changes detected</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* View toggle */}
          <div className="filter-tabs" style={{ margin: 0 }}>
            <button
              className={`filter-tab ${view === 'split' ? 'active' : ''}`}
              onClick={() => setView('split')}
            >
              Split
            </button>
            <button
              className={`filter-tab ${view === 'unified' ? 'active' : ''}`}
              onClick={() => setView('unified')}
            >
              Unified
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        {view === 'split' ? (
          <SplitView diff={diff} originalLines={originalLines} fixedLines={fixedLines} />
        ) : (
          <UnifiedView diff={diff} />
        )}
      </div>

      {/* Footer legend */}
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: '20px',
          flexShrink: 0,
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: 'rgba(250,109,109,0.3)', border: '1px solid var(--red)', borderRadius: '2px' }} />
          <span className="text-mono" style={{ fontSize: '11px' }}>Removed</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: 'rgba(0,229,160,0.2)', border: '1px solid var(--green)', borderRadius: '2px' }} />
          <span className="text-mono" style={{ fontSize: '11px' }}>Added</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '2px' }} />
          <span className="text-mono" style={{ fontSize: '11px' }}>Unchanged</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// SPLIT VIEW — left original, right fixed
// ─────────────────────────────────────────

function SplitView({ diff, originalLines, fixedLines }) {
  // Build two columns from the diff
  // Each column shows line number + content
  // Removed lines show on left with no match on right (and vice versa)
  const leftLines = [];
  const rightLines = [];

  let leftNum = 1;
  let rightNum = 1;

  diff.forEach(chunk => {
    if (chunk.type === 'unchanged') {
      leftLines.push({ num: leftNum++, content: chunk.content, type: 'unchanged' });
      rightLines.push({ num: rightNum++, content: chunk.content, type: 'unchanged' });
    } else if (chunk.type === 'removed') {
      leftLines.push({ num: leftNum++, content: chunk.content, type: 'removed' });
      rightLines.push({ num: null, content: '', type: 'empty' });
    } else if (chunk.type === 'added') {
      leftLines.push({ num: null, content: '', type: 'empty' });
      rightLines.push({ num: rightNum++, content: chunk.content, type: 'added' });
    }
  });

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      {/* Left — original */}
      <div style={{ flex: 1, borderRight: '2px solid var(--border)', overflow: 'auto' }}>
        <div
          style={{
            padding: '6px 12px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--muted)',
            position: 'sticky',
            top: 0,
          }}
        >
          Before (original)
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          {leftLines.map((line, i) => (
            <DiffLine key={i} {...line} side="left" />
          ))}
        </div>
      </div>

      {/* Right — fixed */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div
          style={{
            padding: '6px 12px',
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--muted)',
            position: 'sticky',
            top: 0,
          }}
        >
          After (fixed)
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          {rightLines.map((line, i) => (
            <DiffLine key={i} {...line} side="right" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// UNIFIED VIEW — single column with +/- markers
// ─────────────────────────────────────────

function UnifiedView({ diff }) {
  let lineNum = 1;

  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', minHeight: '100%' }}>
      {diff.map((chunk, i) => {
        const num = chunk.type !== 'added' ? lineNum++ : null;
        return <DiffLine key={i} num={num} content={chunk.content} type={chunk.type} unified />
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// SINGLE LINE
// ─────────────────────────────────────────

function DiffLine({ num, content, type, side, unified }) {
  const bgColor = {
    removed: 'rgba(250,109,109,0.12)',
    added: 'rgba(0,229,160,0.1)',
    unchanged: 'transparent',
    empty: 'rgba(0,0,0,0.15)',
  }[type] || 'transparent';

  const borderColor = {
    removed: 'rgba(250,109,109,0.4)',
    added: 'rgba(0,229,160,0.3)',
    unchanged: 'transparent',
    empty: 'transparent',
  }[type] || 'transparent';

  const marker = unified
    ? { removed: '−', added: '+', unchanged: ' ', empty: ' ' }[type]
    : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        background: bgColor,
        borderLeft: `3px solid ${borderColor}`,
        minHeight: '22px',
      }}
    >
      {/* Line number */}
      <div
        style={{
          width: '44px',
          minWidth: '44px',
          padding: '2px 8px',
          color: 'var(--muted)',
          fontSize: '11px',
          userSelect: 'none',
          textAlign: 'right',
          opacity: type === 'empty' ? 0 : 1,
          borderRight: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.15)',
        }}
      >
        {num || ''}
      </div>

      {/* Marker for unified view */}
      {unified && (
        <div
          style={{
            width: '20px',
            minWidth: '20px',
            padding: '2px 4px',
            color: type === 'removed' ? 'var(--red)' : type === 'added' ? 'var(--green)' : 'var(--muted)',
            fontWeight: 700,
            userSelect: 'none',
          }}
        >
          {marker}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          flex: 1,
          padding: '2px 12px',
          whiteSpace: 'pre',
          color: type === 'empty' ? 'transparent' : type === 'removed' ? 'var(--red)' : type === 'added' ? 'var(--green)' : 'var(--text)',
          overflowX: 'auto',
          lineHeight: '18px',
        }}
      >
        {type === 'empty' ? '·' : content || ' '}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// DIFF ALGORITHM
// ─────────────────────────────────────────

/**
 * Simple line-by-line diff using longest common subsequence (LCS).
 * Returns an array of { type: 'unchanged'|'removed'|'added', content: string }
 *
 * LCS finds the longest sequence of lines that appear in both files
 * in the same order. Lines not in the LCS are either removed (only in original)
 * or added (only in fixed).
 *
 * This handles most SEO fixes well — they typically change 1-5 lines
 * in a file of hundreds.
 */
function computeDiff(originalLines, fixedLines) {
  const m = originalLines.length;
  const n = fixedLines.length;

  // Build LCS table
  // dp[i][j] = length of LCS of originalLines[0..i-1] and fixedLines[0..j-1]
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (originalLines[i - 1] === fixedLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack through the table to build the diff
  const result = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalLines[i - 1] === fixedLines[j - 1]) {
      result.unshift({ type: 'unchanged', content: originalLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', content: fixedLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', content: originalLines[i - 1] });
      i--;
    }
  }

  return result;
}
