// ========================================
// Humanofi — Top Navigation Bar
// ========================================

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useState, useEffect } from "react";

export default function Topbar() {
  const pathname = usePathname();

  // Get rich profile data (creator status, hasToken, etc)
  // Must be called unconditionally (React hooks rule)
  const { user: humanofiUser } = useSupabaseAuth();

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

  // ── HYDRATION FIX ──
  // On first render (SSR + hydration), use static nav items only.
  // Once mounted on client, switch to dynamic items.
  // This prevents the server/client mismatch that causes hydration errors.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Static nav items (always the same on server + client first paint)
  const STATIC_NAV_ITEMS = [
    { href: "/", label: "Explore" },
    { href: "/feed", label: "Feed" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/create", label: "Create" },
  ];

  // Dynamic nav items (only used after client mount)
  const navItems = mounted
    ? (() => {
        const items = [
          { href: "/", label: "Explore" },
          { href: "/feed", label: "Feed" },
          { href: "/leaderboard", label: "Leaderboard" },
        ];

        // Portfolio link (when connected)
        if (privyState.authenticated) {
          items.push({ href: "/portfolio", label: "My Humans" });
        }

        if (humanofiUser?.isCreator && humanofiUser.creator?.mint_address) {
          items.push({
            href: `/person/${humanofiUser.creator.mint_address}`,
            label: "My Token",
          });
        } else {
          items.push({ href: "/create", label: "Create" });
        }

        return items;
      })()
    : STATIC_NAV_ITEMS;

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
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`topbar__link ${
              pathname === item.href ||
              (item.label === "My Token" &&
                pathname?.startsWith("/person/")) ||
              (item.label === "My Humans" &&
                pathname === "/portfolio")
                ? "topbar__link--active"
                : ""
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
