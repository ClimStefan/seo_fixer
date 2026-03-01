'use client';

/**
 * components/ui/FixPanel.js — Manual fix panel with automatic file detection
 *
 * When this panel opens it immediately:
 * 1. Fetches the repo file tree from GitHub
 * 2. Maps the page URL to the correct file path automatically
 * 3. Loads that file's content
 * 4. Shows the user the file ready to edit
 *
 * The user only needs to make the fix and click "Create PR".
 * No manual file path entry needed.
 *
 * If auto-detection fails, we fall back to showing alternative candidates
 * or a manual path input as a last resort.
 */

import { useState, useEffect } from 'react';
import { findFileForUrl, findFileCandidates } from '../../lib/urlToFile.js';

export default function FixPanel({ issue, pageUrl, onClose, isLoggedIn }) {
  const [detecting, setDetecting] = useState(true);
  const [detectedFile, setDetectedFile] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [confidence, setConfidence] = useState(null);
  const [detectionError, setDetectionError] = useState(null);

  const [filePath, setFilePath] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [originalFileContent, setOriginalFileContent] = useState(''); // snapshot of file before edits
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileError, setFileError] = useState(null);

  const [creating, setCreating] = useState(false);
  const [pr, setPr] = useState(null);
  const [fixAdded, setFixAdded] = useState(false);
  const [error, setError] = useState(null);

  const [showManual, setShowManual] = useState(false);
  const [manualPath, setManualPath] = useState('');

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
    try {
      const res = await fetch(`/api/github/file?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.error) { setFileError(data.error); }
      else {
        setFileContent(data.content);
        setOriginalFileContent(data.content); // save snapshot — never changes after this
        setFilePath(path);
      }
    } catch {
      setFileError('Failed to load file from GitHub.');
    } finally {
      setLoadingFile(false);
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
      // First ensure we have an active session
      const sessionRes = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: new URL(pageUrl).origin }),
      });
      const sessionData = await sessionRes.json();
      if (sessionData.error) { setError(sessionData.error); setCreating(false); return; }

      // Add this fix to the session branch
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

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300 }} />

      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '100%', maxWidth: '600px',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          zIndex: 301,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
        className="animate-slide-in"
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0, background: 'var(--bg)' }}>
          <div>
            <div className="text-label" style={{ marginBottom: '4px' }}>Fix this issue</div>
            <div className="text-h3" style={{ marginBottom: '4px' }}>{issue.title}</div>
            <div className="text-mono" style={{ fontSize: '11px' }}>{pageUrl}</div>
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <span className="text-mono">Current:</span>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--surface3)', padding: '2px 8px', borderRadius: '4px', color: severityColor, border: '1px solid var(--border)' }}>
                  {issue.currentValue.length > 100 ? issue.currentValue.slice(0, 100) + '...' : issue.currentValue}
                </code>
              </div>
            )}
          </div>

          {/* What to fix */}
          <div>
            <div className="text-label" style={{ marginBottom: '6px' }}>What to fix</div>
            <div className="text-sm">{issue.recommendation}</div>
          </div>

          {/* File detection */}
          {isLoggedIn && (
            <div>
              <div className="text-label" style={{ marginBottom: '8px' }}>File in your repository</div>

              {detecting && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div className="spinner spinner-sm" />
                  <span className="text-mono">Auto-detecting file from URL...</span>
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
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowManual(true)} style={{ flexShrink: 0 }}>
                      Wrong file?
                    </button>
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
                <div className="alert alert-warning" style={{ marginBottom: '8px' }}>{detectionError}</div>
              )}

              {(!detecting && (showManual || (!detectedFile))) && (
                <div style={{ marginTop: '8px' }}>
                  <label className="input-label">Enter file path manually</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="input" type="text" value={manualPath} onChange={e => setManualPath(e.target.value)} placeholder="app/blog/[slug]/page.js" onKeyDown={e => e.key === 'Enter' && handleLoadManual()} style={{ flex: 1 }} />
                    <button className={`btn btn-secondary btn-md ${loadingFile ? 'btn-loading' : ''}`} onClick={handleLoadManual} disabled={!manualPath.trim() || loadingFile} style={{ flexShrink: 0 }}>
                      {loadingFile ? '' : 'Load'}
                    </button>
                  </div>
                  <p className="input-hint">Path relative to repo root, e.g. <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>app/page.js</code></p>
                </div>
              )}
            </div>
          )}

          {loadingFile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="spinner spinner-sm" />
              <span className="text-mono">Loading file content...</span>
            </div>
          )}

          {fileError && <div className="alert alert-error">{fileError}</div>}

          {/* Fix added to session success */}
          {fixAdded ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="alert alert-success">
                Fix added to your session. Keep fixing more issues or go to the fixes dashboard to create the PR.
              </div>
              <a href="/fixes" className="btn btn-primary btn-md" style={{ textAlign: 'center' }}>
                Review all fixes and create PR
              </a>
              <button className="btn btn-primary btn-md" onClick={onClose}>
                Keep fixing more issues
              </button>
            </div>
          ) : (
            <>
              {fileContent && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label className="input-label">Edit file — make your fix below</label>
                    <span className="text-mono" style={{ fontSize: '10px' }}>{fileContent.split('\n').length} lines</span>
                  </div>
                  <textarea
                    value={fileContent}
                    onChange={e => setFileContent(e.target.value)}
                    style={{ width: '100%', minHeight: '360px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.6', padding: '16px', resize: 'vertical', outline: 'none', transition: 'border-color 0.15s' }}
                    onFocus={e => e.target.style.borderColor = 'var(--green)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    spellCheck={false}
                  />
                  <p className="input-hint">Edit the file above to fix the issue, then click "Create PR". The pull request will appear on GitHub for you to review and merge.</p>
                </div>
              )}

              {error && <div className="alert alert-error">{error}</div>}

              {fileContent && (
                <button
                  className={`btn btn-primary btn-lg ${creating ? 'btn-loading' : ''}`}
                  onClick={handleAddFix}
                  disabled={creating || !filePath.trim() || !fileContent.trim() || !isLoggedIn}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {creating ? '' : 'Add fix to session'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}