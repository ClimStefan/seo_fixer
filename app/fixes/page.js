'use client';

/**
 * app/fixes/page.js — Fix session dashboard
 *
 * Shows the user all fixes they have queued in the current session.
 * Each fix shows the issue, page URL, and file that was changed.
 * User can remove any fix they don't want included in the PR.
 * When ready, one click creates the PR on GitHub with all fixes.
 */

import { useState, useEffect } from 'react';
import Nav from '../../components/layout/Nav';
import DiffViewer from '../../components/ui/DiffViewer';
import Footer from '../../components/layout/Footer';

export default function FixesPage() {
  const [session, setSession] = useState(null);
  const [fixes, setFixes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pr, setPr] = useState(null);
  const [error, setError] = useState(null);
  const [diffFix, setDiffFix] = useState(null); // fix being reviewed in diff viewer

  useEffect(() => { loadSession(); }, []);

  async function loadSession() {
    setLoading(true);
    try {
      const res = await fetch('/api/session/current');
      const data = await res.json();
      setSession(data.session);
      setFixes(data.fixes || []);
    } catch {
      setError('Failed to load session.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveFix(fixId) {
    try {
      await fetch('/api/session/remove-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixId }),
      });
      // Optimistically remove from UI
      setFixes(prev => prev.filter(f => f.id !== fixId));
    } catch {
      setError('Failed to remove fix.');
    }
  }

  async function handleCreatePr() {
    if (!session) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch('/api/session/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); }
      else { setPr(data.pr); }
    } catch {
      setError('Failed to create pull request.');
    } finally {
      setCreating(false);
    }
  }

  const committedFixes = fixes.filter(f => f.status === 'committed');
  const skippedFixes = fixes.filter(f => f.status === 'skipped');

  const severityColor = {
    critical: 'var(--red)',
    warning: 'var(--orange)',
    info: 'var(--purple)',
  };

  return (
    <div className="page-wrapper">
      <Nav />

      {/* Diff viewer — fullscreen overlay when user clicks Review changes */}
     {diffFix && (
  <DiffViewer
          original={diffFix.original_content}
          fixed={diffFix.fixed_content}
          filePath={diffFix.file_path}
          onClose={() => setDiffFix(null)}
        />
      )}

      <div className="container" style={{ padding: '48px 32px 80px', maxWidth: '760px' }}>

        <div className="text-label" style={{ marginBottom: '8px' }}>Fix session</div>
        <h1 className="text-h1" style={{ marginBottom: '10px' }}>Pending fixes</h1>
        <p className="text-sm" style={{ marginBottom: '40px' }}>
          Review the fixes queued in this session. Remove any you don't want,
          then create one pull request with everything.
        </p>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="spinner" />
            <span className="text-mono">Loading session...</span>
          </div>
        )}

        {!loading && !session && (
          <div className="card card-lg" style={{ textAlign: 'center', padding: '48px' }}>
            <div className="text-h3" style={{ marginBottom: '8px' }}>No active session</div>
            <div className="text-sm" style={{ marginBottom: '24px' }}>
              Run a crawl and start fixing issues to create a session.
            </div>
            <a href="/crawl" className="btn btn-primary btn-md">
              Run a crawl
            </a>
          </div>
        )}

        {!loading && session && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Session info */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div className="card-title" style={{ marginBottom: '4px' }}>
                    {session.domain}
                  </div>
                  <div className="text-mono">
                    Branch: {session.branch_name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="badge badge-neutral">
                    {committedFixes.length} fix{committedFixes.length !== 1 ? 'es' : ''} queued
                  </span>
                </div>
              </div>
            </div>

            {/* PR success */}
            {pr && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="alert alert-success">
                  Pull request created with {pr.fixCount} fix{pr.fixCount !== 1 ? 'es' : ''}.
                </div>
                <div className="card" style={{ padding: '24px' }}>
                  <div className="card-title" style={{ marginBottom: '8px' }}>
                    PR #{pr.number} — {pr.title}
                  </div>
                  <div className="text-mono" style={{ marginBottom: '16px' }}>
                    Branch: {pr.branch}
                  </div>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-md"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Review and merge on GitHub
                  </a>
                </div>
                <a href="/crawl" className="btn btn-secondary btn-md" style={{ textAlign: 'center' }}>
                  Start a new crawl
                </a>
              </div>
            )}

            {/* Fix list */}
            {!pr && committedFixes.length > 0 && (
              <div>
                <div className="text-label" style={{ marginBottom: '12px' }}>
                  Fixes in this PR ({committedFixes.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {committedFixes.map(fix => (
                    <div
                      key={fix.id}
                      style={{
                        padding: '16px 18px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '16px',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', marginBottom: '4px' }}>
                          {fix.issue_title}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '11px',
                            color: 'var(--muted)',
                            marginBottom: '4px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fix.page_url}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--surface2)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', color: 'var(--text)' }}>
                            {fix.file_path}
                          </code>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                       <button
  onClick={() => setDiffFix(fix)}
  className="btn btn-ghost btn-sm"
  style={{ flexShrink: 0 }}
  title="Review what changed"
>
  Review changes
</button>
                        <button
                          onClick={() => handleRemoveFix(fix.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ flexShrink: 0, color: 'var(--red)' }}
                          title="Remove this fix from the PR"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skipped fixes */}
            {skippedFixes.length > 0 && (
              <div>
                <div className="text-label" style={{ marginBottom: '12px', color: 'var(--muted)' }}>
                  Removed from PR ({skippedFixes.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {skippedFixes.map(fix => (
                    <div
                      key={fix.id}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        opacity: 0.4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', textDecoration: 'line-through' }}>
                        {fix.issue_title}
                      </div>
                      <div className="text-mono" style={{ fontSize: '10px' }}>{fix.page_url}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!pr && committedFixes.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '48px' }}>
                <div className="text-h3" style={{ marginBottom: '8px' }}>No fixes queued</div>
                <div className="text-sm" style={{ marginBottom: '24px' }}>
                  {skippedFixes.length > 0
                    ? 'All fixes were removed. Go back and add more.'
                    : 'Go back to the crawl and click "Fix this" on issues you want to fix.'}
                </div>
                <a href="/crawl" className="btn btn-primary btn-md">Back to crawl</a>
              </div>
            )}

            {error && (
              <div className="alert alert-error">{error}</div>
            )}

            {/* Create PR button */}
            {!pr && committedFixes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button
                  className={`btn btn-primary btn-lg ${creating ? 'btn-loading' : ''}`}
                  onClick={handleCreatePr}
                  disabled={creating || committedFixes.length === 0}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {creating ? '' : `Create PR with ${committedFixes.length} fix${committedFixes.length !== 1 ? 'es' : ''} on GitHub`}
                </button>
                <p className="text-mono" style={{ textAlign: 'center', fontSize: '11px' }}>
                  One pull request will be opened. You review and merge on GitHub. Vercel deploys automatically.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
