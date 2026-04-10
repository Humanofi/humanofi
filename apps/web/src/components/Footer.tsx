import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        {/* Left — Brand */}
        <div className="footer__brand">
          <Image
            src="/Logo_noire.png"
            alt="Humanofi"
            width={100}
            height={22}
            style={{ width: "auto", height: 22, objectFit: "contain", opacity: 0.7 }}
          />
          <p className="footer__tagline">
            The first market where humans are the asset.
          </p>
        </div>

        {/* Center — Links */}
        <div className="footer__cols">
          <div className="footer__col">
            <div className="footer__col-title">Protocol</div>
            <Link href="/" className="footer__link">Explore</Link>
            <Link href="/leaderboard" className="footer__link">Leaderboard</Link>
            <Link href="/create" className="footer__link">Create Token</Link>
          </div>
          <div className="footer__col">
            <div className="footer__col-title">Resources</div>
            <a href="https://github.com" className="footer__link" target="_blank" rel="noopener">GitHub</a>
            <a href="#" className="footer__link">Documentation</a>
            <a href="#" className="footer__link">Smart Contract</a>
          </div>
          <div className="footer__col">
            <div className="footer__col-title">Community</div>
            <a href="#" className="footer__link">Twitter / X</a>
            <a href="#" className="footer__link">Discord</a>
            <a href="#" className="footer__link">Telegram</a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer__bottom">
        <span>© {new Date().getFullYear()} Humanofi Protocol. All rights reserved.</span>
        <div className="footer__bottom-links">
          <a href="#" className="footer__link">Privacy</a>
          <a href="#" className="footer__link">Terms</a>
          <span className="footer__solana">Built on Solana ◈</span>
        </div>
      </div>
    </footer>
  );
}
