'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const pathname = usePathname();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link href="/" className="nav-logo">
            SEO<span>Fix</span>
          </Link>

          <div className="nav-links">
            <Link href="/" className={`nav-link ${pathname === '/' ? 'active' : ''}`}>
              Audit
            </Link>
            <Link href="/pricing" className={`nav-link ${pathname === '/pricing' ? 'active' : ''}`}>
              Pricing
            </Link>
            <Link href="/how-it-works" className={`nav-link ${pathname === '/how-it-works' ? 'active' : ''}`}>
              How it works
            </Link>
          </div>

          <div className="nav-actions">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setModalOpen(true)}
            >
              Join the waitlist
            </button>
          </div>
        </div>
      </nav>

      {/* Modal — rendered at nav level so it overlays everything */}
      {modalOpen && (
        <WaitlistModal onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

/**
 * WaitlistModal
 * A centered overlay with an email input wired to Web3Forms.
 * Web3Forms sends the submitted email to your inbox — no backend needed.
 * Replace YOUR_WEB3FORMS_KEY with your actual key from web3forms.com/dashboard.
 */
function WaitlistModal({ onClose }) {
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
    /* Backdrop — clicking it closes the modal */
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      {/* Modal box — stop click from bubbling to backdrop */}
      <div
        onClick={e => e.stopPropagation()}
        className="card card-lg animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          border: '1px solid var(--border2)',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="btn btn-ghost btn-sm"
          style={{ position: 'absolute', top: '16px', right: '16px', padding: '4px 8px' }}
        >
          ✕
        </button>

        {status === 'success' ? (
          /* Success state */
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--green-dim)',
                border: '1px solid var(--green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '20px',
                color: 'var(--green)',
              }}
            >
              ✓
            </div>
            <div className="text-h3" style={{ marginBottom: '8px' }}>You are on the list</div>
            <div className="text-sm" style={{ marginBottom: '24px' }}>
              We will reach out as soon as early access opens.
            </div>
            <button className="btn btn-secondary btn-md" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          /* Form state */
          <>
            <div className="text-label" style={{ marginBottom: '8px' }}>Early access</div>
            <div className="text-h2" style={{ marginBottom: '8px' }}>
              Be the first to know
            </div>
            <div className="text-sm" style={{ marginBottom: '24px' }}>
              SEOFix is launching soon. Leave your email and we will reach out when early access opens — including a founding discount.
            </div>

            <form onSubmit={handleSubmit}>
              <label className="input-label">Your email</label>
              <div className="search-bar" style={{ marginBottom: '12px' }}>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={status === 'loading'}
                  autoFocus
                />
                <button
                  type="submit"
                  className={`btn btn-primary btn-md ${status === 'loading' ? 'btn-loading' : ''}`}
                  disabled={status === 'loading' || !email.trim()}
                  style={{ margin: '6px', flexShrink: 0 }}
                >
                  {status === 'loading' ? '' : 'Get early access'}
                </button>
              </div>

              {status === 'error' && (
                <div className="alert alert-error">{errorMsg}</div>
              )}

              <div className="text-mono" style={{ marginTop: '10px' }}>
                No spam. Unsubscribe any time.
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}