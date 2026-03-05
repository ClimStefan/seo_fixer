'use client';

/**
 * components/ui/FixPanel.js
 *
 * Slide-in fix panel. The flow is now:
 *
 * 1. Opens → immediately fetches repo tree + detects file + loads file content
 * 2. Once file is loaded → automatically calls /api/fix/generate (Claude)
 * 3. Claude returns the fixed file content
 * 4. We show the DIFF immediately so the user can see exactly what changed
 * 5. User can edit the fix in the textarea if they want
 * 6. "Add fix to session" commits to the shared branch
 *
 * For guidance-only issues (thin content, noindex) we skip Claude
 * and show a guidance panel with manual steps instead.
 */

import { useState, useEffect } from 'react';
import { findFileForUrl, findFileCandidates } from '../../lib/urlToFile.js';

const VIEW_FILE  = 'file';
const VIEW_DIFF  = 'diff';
const VIEW_GUIDE = 'guide';

export default function FixPanel({ issue, pageUrl, onClose, isLoggedIn }) {
  const [detecting, setDetecting]             = useState(true);
  const [detectedFile, setDetectedFile]       = useState(null);
  const [candidates, setCandidates]           = useState([]);
  const [confidence, setConfidence]           = useState(null);
  const [detectionError, setDetectionError]   = useState(null);
  const [showManual, setShowManual]           = useState(false);
  const [manualPath, setManualPath]           = useState('');

  const [filePath, setFilePath]                       = useState('');
  const [fileContent, setFileContent]                 = useState('');
  const [originalFileContent, setOriginalFileContent] = useState('');
  const [loadingFile, setLoadingFile]                 = useState(false);
  const [fileError, setFileError]                     = useState(null);

  const [generating, setGenerating]       = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [explanation, setExplanation]     = useState('');
  const [changesSummary, setChangesSummary] = useState('');
  const [mode, setMode]                   = useState(null);
  const [guidance, setGuidance]           = useState(null);
  const [fixGenerated, setFixGenerated]   = useState(false);

  const [view, setView]         = useState(VIEW_FILE);
  const [fixAdded, setFixAdded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    if (!isLoggedIn) { setDetecting(false); return; }
    autoDetectFile();
  }, []);

  async function autoDetectFile() {
    setDetecting(true);
    setDetectionError(null);
    try {
      const treeRes = await fetch('/api/github/repo-tree');
      const treeData = await treeRes.json();
      if (treeData.error) { setDetectionError(treeData.error); setDetecting(false); return; }

      const { pageFiles } = treeData;
      const best = findFileForUrl(pageUrl, pageFiles);
      const alternatives = findFileCandidates(pageUrl, pageFiles, 3)
        .filter(c => c.filePath !== best?.filePath);

      setCandidates(alternatives);

      if (best) {
        setDetectedFile(best.filePath);
        setConfidence(best.confidence);
        setFilePath(best.filePath);
        await loadFile(best.filePath);
      } else {
        setDetectionError('Could not automatically detect the file for this URL.');
      }
    } catch (err) {
      setDetectionError(`Detection failed: ${err.message}`);
    } finally {
      setDetecting(false);
    }
  }

  async function loadFile(path) {
    setLoadingFile(true);
    setFileError(null);
    setFileContent('');
    setOriginalFileContent('');
    setFixGenerated(false);
    setGenerateError(null);
    setExplanation('');
    setView(VIEW_FILE);

    try {
      const res = await fetch(`/api/github/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) { setFileError(data.error); return; }

      setFileContent(data.content);
      setOriginalFileContent(data.content);
      setFilePath(path);

      // Auto-trigger Claude fix generation
      await generateFix(data.content, path);
    } catch {
      setFileError('Failed to load file from GitHub.');
    } finally {
      setLoadingFile(false);
    }
  }

  async function generateFix(content, path) {
    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch('/api/fix/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent: content,
          filePath: path || filePath,
          pageUrl,
          issue,
          pageHtml: null,
        }),
      });

      const data = await res.json();
      if (data.error) { setGenerateError(data.error); return; }

      setMode(data.mode);

      if (data.mode === 'guidance') {
        setGuidance(data.guidance);
        setView(VIEW_GUIDE);
        setFixGenerated(true);
        return;
      }

      setFileContent(data.fixedContent);
      setExplanation(data.explanation);
      setChangesSummary(data.changesSummary);
      setFixGenerated(true);
      setView(VIEW_DIFF);
    } catch (err) {
      setGenerateError(`Failed to generate fix: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleLoadManual() {
    if (!manualPath.trim()) return;
    await loadFile(manualPath.trim());
    setDetectedFile(manualPath.trim());
    setConfidence('manual');
    setShowManual(false);
  }

  async function handleAddFix() {
    if (!filePath.trim() || !fileContent.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const sessionRes = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: new URL(pageUrl).origin }),
      });
      const sessionData = await sessionRes.json();
      if (sessionData.error) { setError(sessionData.error); setCreating(false); return; }

      const res = await fetch('/api/session/add-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.session.id,
          filePath: filePath.trim(),
          originalContent: originalFileContent,
          fixedContent: fileContent,
          issueType: issue.type,
          issueTitle: issue.title,
          description: issue.recommendation,
          pageUrl,
        }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setFixAdded(true); }
    } catch {
      setError('Failed to add fix. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  const severityColor = {
    critical: 'var(--red)',
    warning: 'var(--orange)',
    info: 'var(--purple)',
  }[issue.severity] || 'var(--muted)';

  const diffLines = fixGenerated && originalFileContent && fileContent
    ? computeDiff(originalFileContent.split('\n'), fileContent.split('\n'))
    : [];

  const changedCount = diffLines.filter(d => d.type !== 'unchanged').length;

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }} />

      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: '680px',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 301,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
        className="animate-slide-in"
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg)', gap: '16px' }}>
          <div style={{ minWidth: 0 }}>
            <div className="text-label" style={{ marginBottom: '4px' }}>
              {mode === 'auto' ? '✓ Auto-fix ready'
                : mode === 'semi-auto' ? '◐ Review suggested fix'
                : mode === 'guidance' ? '📋 Manual fix needed'
                : generating ? 'Generating fix...'
                : 'Fix this issue'}
            </div>
            <div className="text-h3" style={{ marginBottom: '4px' }}>{issue.title}</div>
            <div className="text-mono" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pageUrl}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ flexShrink: 0 }}>Close</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {!isLoggedIn && (
            <div className="alert alert-warning">
              Connect your GitHub account to create pull requests.{' '}
              <a href="/connect" style={{ color: 'inherit', fontWeight: 700 }}>Connect GitHub →</a>
            </div>
          )}

          {/* Issue summary */}
          <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius)', borderLeft: `3px solid ${severityColor}`, border: `1px solid var(--border)` }}>
            <div className="text-sm" style={{ marginBottom: issue.currentValue ? '8px' : 0 }}>{issue.description}</div>
            {issue.currentValue && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                <span className="text-mono">Current:</span>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--surface3)', padding: '2px 8px', borderRadius: '4px', color: severityColor, border: '1px solid var(--border)' }}>
                  {issue.currentValue.length > 120 ? issue.currentValue.slice(0, 120) + '...' : issue.currentValue}
                </code>
              </div>
            )}
          </div>

          {/* File detection */}
          {isLoggedIn && (
            <div>
              <div className="text-label" style={{ marginBottom: '8px' }}>File in your repository</div>

              {detecting && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div className="spinner spinner-sm" />
                  <span className="text-mono">Auto-detecting file...</span>
                </div>
              )}

              {!detecting && detectedFile && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: confidence === 'exact' ? 'var(--green-dim)' : 'var(--surface2)', borderRadius: 'var(--radius)', border: `1px solid ${confidence === 'exact' ? 'var(--green)' : 'var(--border)'}`, gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text)' }}>{detectedFile}</code>
                      <div className="text-mono" style={{ fontSize: '10px', marginTop: '3px' }}>
                        {confidence === 'exact' ? 'Exact match' : confidence === 'dynamic' ? 'Dynamic route match' : 'Manual selection'}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(true)} style={{ flexShrink: 0 }}>Wrong file?</button>
                  </div>

                  {candidates.length > 0 && (
                    <div>
                      <div className="text-mono" style={{ fontSize: '10px', marginBottom: '6px' }}>Other possible matches:</div>
                      {candidates.map(c => (
                        <button key={c.filePath} onClick={() => loadFile(c.filePath)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: '4px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
                          {c.filePath} <span style={{ opacity: 0.6 }}>({c.confidence})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!detecting && detectionError && !detectedFile && (
                <div className="alert alert-warning">{detectionError}</div>
              )}

              {(!detecting && (showManual || !detectedFile)) && (
                <div style={{ marginTop: '8px' }}>
                  <label className="input-label">Enter file path manually</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="input" type="text" value={manualPath} onChange={e => setManualPath(e.target.value)} placeholder="app/blog/[slug]/page.js" onKeyDown={e => e.key === 'Enter' && handleLoadManual()} style={{ flex: 1 }} />
                    <button className={`btn btn-secondary btn-md ${loadingFile ? 'btn-loading' : ''}`} onClick={handleLoadManual} disabled={!manualPath.trim() || loadingFile} style={{ flexShrink: 0 }}>
                      {loadingFile ? '' : 'Load'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading states */}
          {loadingFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="spinner spinner-sm" />
              <span className="text-mono">Loading file from GitHub...</span>
            </div>
          )}

          {!loadingFile && generating && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.3)', borderRadius: 'var(--radius)' }}>
              <div className="spinner spinner-sm" />
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--green)', marginBottom: '2px' }}>Claude is generating the fix...</div>
                <div className="text-mono" style={{ fontSize: '11px' }}>Analysing your file and applying the minimum change needed.</div>
              </div>
            </div>
          )}

          {fileError && <div className="alert alert-error">{fileError}</div>}

          {generateError && (
            <div>
              <div className="alert alert-error" style={{ marginBottom: '8px' }}>{generateError}</div>
              {fileContent && (
                <button className="btn btn-secondary btn-sm" onClick={() => generateFix(originalFileContent || fileContent, filePath)}>
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Success */}
          {fixAdded ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="alert alert-success">Fix added to your session.</div>
              <a href="/fixes" className="btn btn-primary btn-md" style={{ textAlign: 'center' }}>Review all fixes and create PR</a>
              <button className="btn btn-ghost btn-md" onClick={onClose}>Keep fixing more issues</button>
            </div>

          ) : view === VIEW_GUIDE ? (
            <GuidanceView guidance={guidance} />

          ) : fixGenerated && !generating ? (
            <>
              {/* Claude explanation */}
              {explanation && (
                <div style={{ padding: '14px 16px', background: 'var(--green-dim)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--green)', fontWeight: 700, marginBottom: '6px', letterSpacing: '0.5px' }}>
                    {mode === 'semi-auto' ? 'SUGGESTED FIX — REVIEW CAREFULLY' : 'AUTO FIX APPLIED'}
                  </div>
                  <div className="text-sm" style={{ marginBottom: changesSummary ? '6px' : 0 }}>{explanation}</div>
                  {changesSummary && (
                    <div className="text-mono" style={{ fontSize: '11px', color: 'var(--green)' }}>→ {changesSummary}</div>
                  )}
                </div>
              )}

              {/* View toggle */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="filter-tabs" style={{ margin: 0 }}>
                  <button className={`filter-tab ${view === VIEW_DIFF ? 'active' : ''}`} onClick={() => setView(VIEW_DIFF)}>
                    Diff view{changedCount > 0 && <span style={{ marginLeft: '5px', background: 'var(--green)', color: 'var(--bg)', borderRadius: '100px', padding: '0 5px', fontSize: '10px' }}>{changedCount}</span>}
                  </button>
                  <button className={`filter-tab ${view === VIEW_FILE ? 'active' : ''}`} onClick={() => setView(VIEW_FILE)}>
                    Edit file
                  </button>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => generateFix(originalFileContent, filePath)}
                  style={{ fontSize: '11px' }}
                >
                  Regenerate
                </button>
              </div>

              {/* Diff */}
              {view === VIEW_DIFF && (
                <InlineDiff diffLines={diffLines} />
              )}

              {/* Edit textarea */}
              {view === VIEW_FILE && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="input-label">Edit the fix if needed</label>
                    <span className="text-mono" style={{ fontSize: '10px' }}>{fileContent.split('\n').length} lines</span>
                  </div>
                  <textarea
                    value={fileContent}
                    onChange={e => setFileContent(e.target.value)}
                    style={{ width: '100%', minHeight: '320px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', padding: '16px', resize: 'vertical', outline: 'none' }}
                    onFocus={e => e.target.style.borderColor = 'var(--green)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    spellCheck={false}
                  />
                </div>
              )}

              {error && <div className="alert alert-error">{error}</div>}

              <button
                className={`btn btn-primary btn-lg ${creating ? 'btn-loading' : ''}`}
                onClick={handleAddFix}
                disabled={creating || !filePath.trim() || !fileContent.trim() || !isLoggedIn}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {creating ? '' : 'Add fix to session →'}
              </button>
            </>
          ) : null}

        </div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────
// INLINE DIFF — shows only changed lines + context
// ─────────────────────────────────────────

function InlineDiff({ diffLines }) {
  if (!diffLines || diffLines.length === 0) {
    return <div className="alert alert-warning">No differences detected.</div>;
  }

  const CONTEXT = 3;
  const changedIndices = new Set(
    diffLines.map((d, i) => d.type !== 'unchanged' ? i : -1).filter(i => i >= 0)
  );

  const visibleIndices = new Set();
  changedIndices.forEach(ci => {
    for (let i = Math.max(0, ci - CONTEXT); i <= Math.min(diffLines.length - 1, ci + CONTEXT); i++) {
      visibleIndices.add(i);
    }
  });

  const display = [];
  let lastIndex = -1;
  [...visibleIndices].sort((a, b) => a - b).forEach(i => {
    if (lastIndex >= 0 && i > lastIndex + 1) {
      display.push({ type: 'separator', content: `··· ${i - lastIndex - 1} unchanged lines ···` });
    }
    display.push({ ...diffLines[i], lineIndex: i });
    lastIndex = i;
  });

  let leftNum = 1, rightNum = 1;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: '11px', borderRight: '1px solid var(--border)' }}>Before</div>
        <div style={{ padding: '8px 12px', color: 'var(--muted)', fontSize: '11px' }}>After (Claude's fix)</div>
      </div>

      {display.map((line, i) => {
        if (line.type === 'separator') {
          return (
            <div key={i} style={{ padding: '4px 12px', background: 'var(--surface2)', color: 'var(--muted)', fontSize: '10px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
              {line.content}
            </div>
          );
        }

        const isRemoved  = line.type === 'removed';
        const isAdded    = line.type === 'added';
        const leftContent  = isAdded   ? '' : line.content;
        const rightContent = isRemoved ? '' : line.content;

        if (!isAdded)   leftNum++;
        if (!isRemoved) rightNum++;

        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
            <div style={{ display: 'flex', background: isRemoved ? 'rgba(250,109,109,0.12)' : 'transparent', borderLeft: isRemoved ? '3px solid var(--red)' : '3px solid transparent', borderRight: '1px solid var(--border)', minHeight: '22px' }}>
              <div style={{ width: '32px', minWidth: '32px', padding: '3px 6px', color: 'var(--muted)', fontSize: '10px', textAlign: 'right', userSelect: 'none', borderRight: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}>
                {!isAdded ? leftNum - 1 : ''}
              </div>
              <div style={{ padding: '3px 10px', whiteSpace: 'pre', overflowX: 'auto', color: isRemoved ? 'var(--red)' : 'var(--text)', flex: 1 }}>
                {leftContent || ' '}
              </div>
            </div>
            <div style={{ display: 'flex', background: isAdded ? 'rgba(0,229,160,0.10)' : 'transparent', borderLeft: isAdded ? '3px solid var(--green)' : '3px solid transparent', minHeight: '22px' }}>
              <div style={{ width: '32px', minWidth: '32px', padding: '3px 6px', color: 'var(--muted)', fontSize: '10px', textAlign: 'right', userSelect: 'none', borderRight: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}>
                {!isRemoved ? rightNum - 1 : ''}
              </div>
              <div style={{ padding: '3px 10px', whiteSpace: 'pre', overflowX: 'auto', color: isAdded ? 'var(--green)' : 'var(--text)', flex: 1 }}>
                {rightContent || ' '}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// GUIDANCE VIEW
// ─────────────────────────────────────────

function GuidanceView({ guidance }) {
  if (!guidance) return null;
  return (
    <div style={{ padding: '20px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', marginBottom: '16px' }}>{guidance.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {guidance.steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--surface3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 700, color: 'var(--muted)' }}>
              {i + 1}
            </div>
            <div className="text-sm" style={{ paddingTop: '2px' }}>{step}</div>
          </div>
        ))}
      </div>
      {guidance.note && (
        <div style={{ padding: '10px 12px', background: 'var(--surface3)', borderRadius: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>
          ℹ {guidance.note}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// LCS DIFF
// ─────────────────────────────────────────

function computeDiff(originalLines, fixedLines) {
  const m = originalLines.length;
  const n = fixedLines.length;
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
