'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <div className="container nav-inner">
        {/* Logo */}
        <Link href="/" className="nav-logo">
          SEO<span>Fix</span>
        </Link>

        {/* Nav links */}
        <div className="nav-links">
          <Link
            href="/"
            className={`nav-link ${pathname === '/' ? 'active' : ''}`}
          >
            Audit
          </Link>
          <Link
            href="/pricing"
            className={`nav-link ${pathname === '/pricing' ? 'active' : ''}`}
          >
            Pricing
          </Link>
          <Link
            href="/how-it-works"
            className={`nav-link ${pathname === '/how-it-works' ? 'active' : ''}`}
          >
            How it works
          </Link>
        </div>

        {/* Actions */}
        <div className="nav-actions">
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}
