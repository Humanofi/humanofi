// ========================================
// Humanofi — My Wallet Page
// ========================================
// Dedicated page for wallet management:
//  - View wallet address & SOL balance
//  - Buy SOL (onramp via MoonPay/Privy)
//  - Export to Phantom (embedded wallets only)

"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import { usePrivy } from "@privy-io/react-auth";
import { useFundWallet, useExportWallet } from "@privy-io/react-auth/solana";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd, solToUsd } from "@/lib/price";
import {
  Wallet, Lightning, Copy, Export, ArrowRight,
  ShieldCheck, NumberOne, NumberTwo, NumberThree,
  ArrowSquareOut,
} from "@phosphor-icons/react";

export default function WalletPage() {
  const { ready, authenticated, login, user } = usePrivy();
  const { fundWallet } = useFundWallet();
  const { exportWallet } = useExportWallet();
  const { priceUsd: solPriceUsd } = useSolPrice();

  const walletAddress = user?.wallet?.address || null;
  const isEmbeddedWallet = user?.wallet?.walletClientType === "privy";
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`
    : null;

  const [solBalance, setSolBalance] = useState(0);
  const [copied, setCopied] = useState(false);
  const [exportStarted, setExportStarted] = useState(false);

  // Fetch SOL balance
  useEffect(() => {
    if (!walletAddress) return;
    const fetchSol = async () => {
      try {
        const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
        const res = await fetch(rpc, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "getBalance",
            params: [walletAddress],
          }),
        });
        const data = await res.json();
        setSolBalance((data?.result?.value || 0) / LAMPORTS_PER_SOL);
      } catch { /* ignore */ }
    };
    fetchSol();
    const interval = setInterval(fetchSol, 15000);
    return () => clearInterval(interval);
  }, [walletAddress]);

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBuySol = () => {
    if (!walletAddress) return;
    fundWallet({ address: walletAddress });
  };

  const handleExport = () => {
    setExportStarted(true);
    exportWallet();
  };

  function formatSol(n: number) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    if (n >= 1) return n.toFixed(4);
    if (n >= 0.0001) return n.toFixed(4);
    if (n >= 0.000001) return n.toFixed(6);
    if (n > 0) return n.toExponential(2);
    return "0";
  }

  // ── Not connected ──
  if (!ready) {
    return (
      <>
        <div className="halftone-bg" />
        <Topbar />
        <main className="page" style={{ textAlign: "center", paddingTop: 120, minHeight: "60vh" }}>
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>Loading...</div>
        </main>
        <Footer />
      </>
    );
  }

  if (!authenticated || !walletAddress) {
    return (
      <>
        <div className="halftone-bg" />
        <Topbar />
        <main className="page" style={{ textAlign: "center", paddingTop: 120, minHeight: "60vh" }}>
          <Wallet size={48} weight="bold" style={{ color: "var(--text-muted)", marginBottom: 16 }} />
          <h1 className="page__title" style={{ marginBottom: 8 }}>My Wallet</h1>
          <p style={{ color: "var(--text-muted)", fontWeight: 600, marginBottom: 24 }}>
            Connect your wallet to view your balance and manage your funds
          </p>
          <button className="btn-solid" onClick={login}>Connect Wallet</button>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      <main className="page" style={{ paddingTop: 40, maxWidth: 700 }}>
        {/* Header */}
        <h1 className="page__title" style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 10 }}>
          <Wallet size={28} weight="bold" />
          My Wallet
        </h1>

        {/* ── Wallet Card ── */}
        <div className="wallet-section" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
          {/* Address row */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, paddingBottom: 16, borderBottom: "2px solid var(--border-light)" }}>
            <div style={{ flex: 1 }}>
              <div className="wallet-section__label">Wallet Address</div>
              <div className="wallet-section__address" style={{ fontSize: "0.85rem" }}>
                <span>{shortAddress}</span>
                <button className="wallet-section__copy" onClick={handleCopy}>
                  <Copy size={11} weight="bold" style={{ marginRight: 3 }} />
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            {isEmbeddedWallet && (
              <span style={{
                fontSize: "0.62rem", fontWeight: 800, textTransform: "uppercase",
                background: "#f0fdf4", border: "1.5px solid #22c55e", color: "#166534",
                padding: "4px 10px", letterSpacing: "0.04em",
              }}>
                <ShieldCheck size={12} weight="bold" style={{ verticalAlign: "middle", marginRight: 3 }} />
                Embedded Wallet
              </span>
            )}
          </div>

          {/* Balance */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="wallet-section__label">SOL Balance</div>
              <div className="wallet-section__balance" style={{ fontSize: "2rem" }}>
                {formatSol(solBalance)} SOL
              </div>
              {solPriceUsd > 0 && solBalance > 0 && (
                <div className="wallet-section__balance-usd">
                  ≈ {formatUsd(solToUsd(solBalance, solPriceUsd))}
                </div>
              )}
            </div>
            <button className="wallet-section__btn wallet-section__btn--primary" onClick={handleBuySol} style={{ height: 48, fontSize: "0.85rem" }}>
              <Lightning size={18} weight="fill" />
              Buy SOL
            </button>
          </div>
        </div>

        {/* ── Buy SOL Info ── */}
        <div style={{
          border: "2px solid var(--border)", background: "#fff", padding: "20px 24px",
          boxShadow: "6px 6px 0px var(--border)", marginBottom: 32,
        }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Lightning size={20} weight="fill" style={{ color: "#f59e0b" }} />
            Buy SOL with your card
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.7, fontWeight: 600, marginBottom: 16 }}>
            Purchase SOL instantly using your credit card, debit card, Apple Pay, or Google Pay.
            SOL is the native currency of Solana — you need it to buy human tokens on Humanofi.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["💳 Credit Card", "🍎 Apple Pay", "📱 Google Pay"].map((method) => (
              <span key={method} style={{
                fontSize: "0.72rem", fontWeight: 700, padding: "6px 12px",
                background: "var(--bg-panel)", border: "1.5px solid var(--border-light)",
              }}>
                {method}
              </span>
            ))}
          </div>
        </div>

        {/* ── Export to Phantom (embedded wallets only) ── */}
        {isEmbeddedWallet && (
          <div style={{
            border: "3px solid #ab9ff2", background: "#faf5ff", padding: "24px",
            boxShadow: "6px 6px 0px rgba(139, 125, 207, 0.3)", marginBottom: 32,
          }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
              <Export size={22} weight="bold" style={{ color: "#7c3aed" }} />
              Export to Phantom Wallet
            </h2>
            <p style={{ fontSize: "0.85rem", color: "#6b21a8", lineHeight: 1.7, fontWeight: 600, marginBottom: 20 }}>
              Take your wallet anywhere. Export your private key and import it into Phantom —
              the most popular Solana wallet — to manage your tokens from your browser extension or mobile app.
            </p>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              {/* Step 1 */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32, background: "#ab9ff2", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: "0.85rem", flexShrink: 0,
                }}>
                  <NumberOne size={18} weight="bold" />
                </div>
                <div>
                  <strong style={{ fontSize: "0.85rem", fontWeight: 800 }}>Export your private key</strong>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "4px 0 0", fontWeight: 600 }}>
                    Click the button below. Privy will securely display your private key in a protected window.
                    Copy it carefully.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32, background: "#ab9ff2", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: "0.85rem", flexShrink: 0,
                }}>
                  <NumberTwo size={18} weight="bold" />
                </div>
                <div>
                  <strong style={{ fontSize: "0.85rem", fontWeight: 800 }}>Install Phantom</strong>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "4px 0 0", fontWeight: 600 }}>
                    Download the Phantom browser extension or mobile app if you don&apos;t have it yet.
                  </p>
                  <a
                    href="https://phantom.app/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: "0.72rem", fontWeight: 800, color: "#7c3aed",
                      marginTop: 6, textDecoration: "none",
                    }}
                  >
                    phantom.app/download <ArrowSquareOut size={12} weight="bold" />
                  </a>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{
                  width: 32, height: 32, background: "#ab9ff2", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 900, fontSize: "0.85rem", flexShrink: 0,
                }}>
                  <NumberThree size={18} weight="bold" />
                </div>
                <div>
                  <strong style={{ fontSize: "0.85rem", fontWeight: 800 }}>Import into Phantom</strong>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.6, margin: "4px 0 0", fontWeight: 600 }}>
                    Open Phantom → Click the menu icon → <strong>Add / Connect Wallet</strong> →
                    <strong> Import Private Key</strong> → Paste your key → Done!
                  </p>
                </div>
              </div>
            </div>

            {/* Export button */}
            <button
              className="wallet-section__btn wallet-section__btn--phantom"
              onClick={handleExport}
              style={{ width: "100%", justifyContent: "center", height: 48, fontSize: "0.85rem" }}
            >
              <Export size={18} weight="bold" />
              {exportStarted ? "Export started — check the Privy popup" : "Export Private Key"}
            </button>

            {/* Security note */}
            <div style={{
              marginTop: 16, padding: "10px 14px",
              background: "#fef3c7", border: "1.5px solid #f59e0b",
              fontSize: "0.72rem", fontWeight: 700, color: "#92400e", lineHeight: 1.6,
            }}>
              <ShieldCheck size={14} weight="bold" style={{ verticalAlign: "middle", marginRight: 4 }} />
              <strong>Security:</strong> Your private key is never stored by Humanofi.
              The export happens in a secure Privy iframe — only you can see your key.
            </div>
          </div>
        )}

        {/* ── Not embedded wallet notice ── */}
        {!isEmbeddedWallet && (
          <div style={{
            border: "2px solid var(--border)", background: "#fff", padding: "20px 24px",
            boxShadow: "6px 6px 0px var(--border)", marginBottom: 32,
            textAlign: "center",
          }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 700 }}>
              You&apos;re connected with an external wallet (Phantom, Solflare...). <br />
              Wallet export is only available for Humanofi embedded wallets.
            </p>
          </div>
        )}

        {/* Back to explore */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <Link href="/" className="btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowRight size={14} weight="bold" />
            Back to Explore
          </Link>
        </div>
      </main>

      <Footer />
    </>
  );
}
