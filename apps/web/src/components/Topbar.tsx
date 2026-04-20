// ========================================
// Humanofi — Top Navigation Bar
// ========================================
// v4.0: Holder profiles — identicon + edit profile modal

"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofiAuth } from "@/components/layout/AuthSyncProvider";
import { useState, useEffect, useRef } from "react";
import { Wallet, CaretDown, SignOut, User, PencilSimple, Info } from "@phosphor-icons/react";
import { getAvatarUrl } from "@/lib/identicon";
import ProfileEditModal from "@/components/ProfileEditModal";
import GlobalSearch from "@/components/GlobalSearch";

export default function Topbar() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { user: humanofiUser } = useHumanofiAuth();

  const walletAddress = user?.wallet?.address || null;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  // ── HYDRATION FIX ──
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Profile state
  const [profileData, setProfileData] = useState<{
    display_name: string;
    avatar_url: string | null;
    bio: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch profile data when wallet is available
  useEffect(() => {
    if (!walletAddress) return;
    fetch(`/api/profile?wallet=${walletAddress}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) setProfileData(data.profile);
      })
      .catch(() => {});
  }, [walletAddress]);

  const avatarUrl = walletAddress
    ? getAvatarUrl(walletAddress, profileData?.avatar_url)
    : null;

  // Static nav items
  const STATIC_NAV_ITEMS = [
    { href: "/", label: "Home" },
    { href: "/explore", label: "Explore" },
    { href: "/create", label: "Create" },
  ];

  // Dynamic nav items (only used after client mount)
  const navItems = mounted
    ? (() => {
        const items = [
          { href: "/", label: "Home" },
          { href: "/explore", label: "Explore" },
        ];

        if (authenticated) {
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
    <>
      <nav className="topbar">
        <Link href="/" className="topbar__logo">
          <Image
            src="/Logo_noire.png"
            alt="Humanofi — The Human Token Market on Solana"
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

        <Link
          href="/how-it-works"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: "0.82rem", fontWeight: 800, color: "var(--text-muted)",
            textDecoration: "none", marginRight: 16, padding: "6px 12px",
            borderRadius: "6px", transition: "background 0.15s, color 0.15s"
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
        >
          <Info size={16} weight="bold" />
          How It Works
        </Link>

        <GlobalSearch />

        {/* Auth buttons */}
        {!ready ? (
          <div className="btn-outline" style={{ opacity: 0.5, cursor: "default" }}>
            Loading...
          </div>
        ) : authenticated ? (
          <div style={{ position: "relative" }} ref={menuRef}>
            <button
              className="btn-solid"
              id="wallet-status-btn"
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: "flex", gap: "8px", alignItems: "center" }}
            >
              {avatarUrl && (
                <Image
                  src={avatarUrl}
                  alt=""
                  width={22}
                  height={22}
                  style={{ border: "2px solid rgba(255,255,255,0.3)", flexShrink: 0 }}
                />
              )}
              {profileData?.display_name || shortAddress || "Connected"}
              <CaretDown size={14} weight="bold" style={{ marginLeft: 2 }} />
            </button>

            {menuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                background: "#fff", border: "2px solid var(--border)",
                boxShadow: "4px 4px 0px var(--border)", minWidth: 200, zIndex: 50,
                display: "flex", flexDirection: "column",
              }}>
                {/* Edit Profile */}
                <button
                  onClick={() => { setMenuOpen(false); setProfileModalOpen(true); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                    fontWeight: 800, fontSize: "0.85rem",
                    background: "transparent", border: "none", borderBottom: "2px solid var(--border)",
                    width: "100%", textAlign: "left", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-bg)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <PencilSimple size={16} weight="bold" />
                  Edit Profile
                </button>

                {humanofiUser?.isCreator && humanofiUser.creator?.mint_address && (
                  <Link
                    href={`/person/${humanofiUser.creator.mint_address}`}
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                      borderBottom: "2px solid var(--border)", fontWeight: 800, fontSize: "0.85rem"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <User size={16} weight="bold" />
                    My Token
                  </Link>
                )}

                {user?.wallet?.walletClientType === "privy" && (
                  <Link
                    href="/wallet"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                      borderBottom: "2px solid var(--border)", fontWeight: 800, fontSize: "0.85rem",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--accent-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <Wallet size={16} weight="bold" />
                    View Wallet
                  </Link>
                )}
                
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
                    fontWeight: 800, fontSize: "0.85rem", color: "#ef4444",
                    background: "transparent", border: "none", width: "100%", textAlign: "left",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#fff1f2"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <SignOut size={16} weight="bold" />
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            className="btn-solid"
            id="connect-wallet-btn"
            onClick={() => login()}
          >
            Connect Wallet
          </button>
        )}
      </nav>

      {/* Profile Edit Modal */}
      {walletAddress && (
        <ProfileEditModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          walletAddress={walletAddress}
          currentDisplayName={profileData?.display_name || ""}
          currentAvatarUrl={profileData?.avatar_url || null}
          currentBio={profileData?.bio || ""}
          onSave={(name, bio) => {
            setProfileData((prev) => prev ? { ...prev, display_name: name, bio } : prev);
          }}
        />
      )}
    </>
  );
}
