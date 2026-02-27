import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <p className="footer-copy">
          SEOFix &copy; {new Date().getFullYear()} — Built for founders, not agencies.
        </p>
        <div className="footer-links">
          <Link href="/privacy" className="footer-link">Privacy</Link>
          <Link href="/terms" className="footer-link">Terms</Link>
          <a
            href="https://keywordscluster.com"
            className="footer-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            Keywords Cluster
          </a>
        </div>
      </div>
    </footer>
  );
}
