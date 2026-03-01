'use client';

/**
 * app/connect/page.js — GitHub connection and repo selector
 *
 * This page has three states:
 * 1. Not connected — shows "Connect GitHub" button
 * 2. Connected, no repo selected — shows repo dropdown to pick which repo
 * 3. Connected, repo selected — shows success and link to run a crawl
 *
 * Flow:
 * - User clicks "Connect GitHub" → redirects to /api/auth/github → GitHub OAuth → callback
 * - After OAuth, page reloads with ?success=true and user is logged in
 * - User picks their repo from the dropdown
 * - We save the repo to Supabase via /api/github/save-repo
 * - User is ready to create PRs
 */

import { useState, useEffect } from 'react';
import Nav from '../../components/layout/Nav';
import Footer from '../../components/layout/Footer';

export default function ConnectPage() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [repos, setRepos] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [savedRepo, setSavedRepo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [domain, setDomain] = useState('');

  // Read URL params for OAuth result feedback
  const urlParams = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const oauthSuccess = urlParams.get('success') === 'true';
  const oauthError = urlParams.get('error');

  // On mount — check if user is logged in and load their saved repo
  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        setUser(data.user);

        if (data.user) {
          // Load their repos and saved repo simultaneously
          loadRepos();
          loadSavedRepo();
        }
      } catch {
        setError('Failed to load session.');
      } finally {
        setLoadingUser(false);
      }
    }
    loadUser();
  }, []);

  async function loadRepos() {
    setLoadingRepos(true);
    try {
      const res = await fetch('/api/github/repos');
      const data = await res.json();
      if (data.repos) setRepos(data.repos);
    } catch {
      setError('Failed to load GitHub repositories.');
    } finally {
      setLoadingRepos(false);
    }
  }

  async function loadSavedRepo() {
    try {
      const res = await fetch('/api/github/saved-repo');
      const data = await res.json();
      if (data.site) setSavedRepo(data.site);
    } catch {
      // No saved repo yet — that's fine
    }
  }

  async function handleSaveRepo() {
    if (!selectedRepo || !domain.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/github/save-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          github_repo: selectedRepo.name,
          github_owner: selectedRepo.owner,
          github_branch: selectedRepo.default_branch,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSavedRepo(data.site);
      }
    } catch {
      setError('Failed to save repository.');
    } finally {
      setSaving(false);
    }
  }

  if (loadingUser) {
    return (
      <div className="page-wrapper">
        <Nav />
        <div className="loading-state">
          <div className="spinner" />
          Loading...
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <Nav />

      <div className="container-sm" style={{ padding: '48px 32px 80px' }}>
        <div className="text-label" style={{ marginBottom: '8px' }}>GitHub integration</div>
        <h1 className="text-h1" style={{ marginBottom: '10px' }}>Connect your repository</h1>
        <p className="text-sm" style={{ marginBottom: '40px', maxWidth: '480px' }}>
          Connect your GitHub repo so SEOFix can create pull requests that fix
          SEO issues directly in your code.
        </p>

        {/* OAuth error feedback */}
        {oauthError && (
          <div className="alert alert-error" style={{ marginBottom: '24px' }}>
            GitHub connection failed ({oauthError}). Please try again.
          </div>
        )}

        {/* ── NOT CONNECTED ── */}
        {!user && (
          <div className="card card-lg" style={{ maxWidth: '480px' }}>
            <div className="text-h3" style={{ marginBottom: '8px' }}>
              Connect your GitHub account
            </div>
            <div className="text-sm" style={{ marginBottom: '24px' }}>
              We need read and write access to your repositories to create
              pull requests. We only touch files you explicitly approve via PR.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <FeatureRow text="Create branches and pull requests for SEO fixes" />
              <FeatureRow text="Read your HTML/JSX files to understand the current code" />
              <FeatureRow text="Never push directly to main — always via PR" />
            </div>

            <a
              href="/api/auth/github"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <GithubIcon />
              Connect GitHub
            </a>

            <p className="text-mono" style={{ marginTop: '12px', textAlign: 'center' }}>
              You can disconnect at any time from GitHub settings.
            </p>
          </div>
        )}

        {/* ── CONNECTED ── */}
        {user && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '560px' }}>

            {/* Connected account card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: 'var(--green)',
                    }}
                  />
                  GitHub connected
                </div>
                <a
                  href="/api/auth/logout"
                  className="btn btn-ghost btn-sm"
                >
                  Disconnect
                </a>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {user.github_avatar && (
                  <img
                    src={user.github_avatar}
                    alt={user.github_username}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--border)' }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--white)', fontSize: '14px' }}>
                    {user.github_username}
                  </div>
                  {user.email && (
                    <div className="text-mono" style={{ fontSize: '11px' }}>{user.email}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Saved repo — shown if already configured */}
            {savedRepo && (
              <div className="card card-green">
                <div className="card-title" style={{ marginBottom: '12px' }}>
                  Active repository
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text)', marginBottom: '4px' }}>
                  {savedRepo.github_owner}/{savedRepo.github_repo}
                </div>
                <div className="text-mono">
                  Branch: {savedRepo.github_branch} · Domain: {savedRepo.domain}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                  <a href="/crawl" className="btn btn-primary btn-md">
                    Run full site crawl
                  </a>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSavedRepo(null)}
                  >
                    Change repo
                  </button>
                </div>
              </div>
            )}

            {/* Repo selector — shown when no repo saved yet or changing */}
            {!savedRepo && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: '16px' }}>
                  Select your repository
                </div>

                {/* Domain input */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label">Your website domain</label>
                  <input
                    className="input"
                    type="text"
                    value={domain}
                    onChange={e => setDomain(e.target.value)}
                    placeholder="https://yoursite.com"
                  />
                  <p className="input-hint">The live URL of the site this repo powers.</p>
                </div>

                {/* Repo dropdown */}
                <div style={{ marginBottom: '16px' }}>
                  <label className="input-label">GitHub repository</label>
                  {loadingRepos ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 0' }}>
                      <div className="spinner spinner-sm" />
                      <span className="text-mono">Loading repositories...</span>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        overflow: 'hidden',
                        maxHeight: '280px',
                        overflowY: 'auto',
                      }}
                    >
                      {repos.length === 0 && (
                        <div className="text-mono" style={{ padding: '16px', color: 'var(--muted)' }}>
                          No repositories found.
                        </div>
                      )}
                      {repos.map(repo => (
                        <button
                          key={repo.id}
                          onClick={() => setSelectedRepo(repo)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            background: selectedRepo?.id === repo.id ? 'var(--green-dim)' : 'transparent',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.15s',
                            border: 'none',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--text)' }}>
                              {repo.full_name}
                            </div>
                            <div className="text-mono" style={{ fontSize: '10px', marginTop: '2px' }}>
                              {repo.private ? 'Private' : 'Public'} · {repo.default_branch}
                            </div>
                          </div>
                          {selectedRepo?.id === repo.id && (
                            <div style={{ color: 'var(--green)', fontSize: '14px' }}>✓</div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {error && (
                  <div className="alert alert-error" style={{ marginBottom: '12px' }}>
                    {error}
                  </div>
                )}

                <button
                  className={`btn btn-primary btn-md ${saving ? 'btn-loading' : ''}`}
                  onClick={handleSaveRepo}
                  disabled={!selectedRepo || !domain.trim() || saving}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {saving ? '' : 'Save and continue'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

function FeatureRow({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <div style={{ color: 'var(--green)', flexShrink: 0, marginTop: '1px', fontSize: '13px' }}>✓</div>
      <div className="text-sm">{text}</div>
    </div>
  );
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}
