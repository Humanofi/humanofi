// ========================================
// Humanofi — Top Navigation Bar
// ========================================

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";

const NAV_ITEMS = [
  { href: "/", label: "Explore" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/create", label: "Create" },
];

export default function Topbar() {
  const pathname = usePathname();

  // Try to use Privy — gracefully handle when provider is not mounted
  let privyState: {
    ready: boolean;
    authenticated: boolean;
    login: () => void;
    logout: () => void;
    user: { wallet?: { address?: string } } | null;
  } = {
    ready: false,
    authenticated: false,
    login: () => {},
    logout: () => {},
    user: null,
  };

  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const privy = usePrivy();
    privyState = {
      ready: privy.ready,
      authenticated: privy.authenticated,
      login: privy.login,
      logout: privy.logout,
      user: privy.user as typeof privyState.user,
    };
  } catch {
    // Privy not mounted — use fallback state
  }

  const walletAddress = privyState.user?.wallet?.address;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <nav className="topbar">
      <Link href="/" className="topbar__logo">
        <Image
          src="/Logo_noire.png"
          alt="Humanofi"
          width={120}
          height={26}
          priority
          style={{ width: "auto", height: 26, objectFit: "contain" }}
        />
        <span className="topbar__beta">Beta · Devnet</span>
      </Link>

      <div className="topbar__nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`topbar__link ${
              pathname === item.href ? "topbar__link--active" : ""
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="topbar__spacer" />

      <div className="topbar__search">
        <span className="topbar__search-icon">⌕</span>
        <input type="text" placeholder="Search for a human..." />
      </div>

      {privyState.ready && privyState.authenticated ? (
        <button
          className="btn-outline"
          id="wallet-status-btn"
          onClick={() => privyState.logout()}
          title="Click to disconnect"
        >
          {shortAddress || "Connected"}
        </button>
      ) : (
        <button
          className="btn-solid"
          id="connect-wallet-btn"
          onClick={() => privyState.login()}
        >
          Connect Wallet
        </button>
      )}
    </nav>
  );
}
