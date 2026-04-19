"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Phantom Wallet Types ──
interface PhantomSolana {
  isPhantom: boolean;
  isConnected?: boolean;
  publicKey?: { toString(): string; toBytes(): Uint8Array };
  connect(): Promise<{ publicKey: { toString(): string; toBytes(): Uint8Array } }>;
  signMessage(message: Uint8Array, encoding: string): Promise<{ signature: Uint8Array }>;
}

function getPhantom(): PhantomSolana | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: PhantomSolana } };
  return w.phantom?.solana ?? null;
}

// ── Base58 encoder (Solana standard, no external dependency) ──
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

export default function AdminLoginPage() {
  const router = useRouter();

  const [walletAddress, setWalletAddress] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-detect if Phantom is already connected
  useEffect(() => {
    const phantom = getPhantom();
    if (phantom?.isConnected && phantom.publicKey) {
      setWalletAddress(phantom.publicKey.toString());
    }
  }, []);

  // Connect Phantom wallet directly (no Privy)
  const connectWallet = useCallback(async () => {
    setError("");
    const phantom = getPhantom();
    if (!phantom?.isPhantom) {
      setError("Phantom wallet not found. Install it at phantom.app");
      return;
    }
    try {
      const resp = await phantom.connect();
      setWalletAddress(resp.publicKey.toString());
    } catch {
      setError("Wallet connection rejected");
    }
  }, []);

  // Sign nonce + submit password
  const handleLogin = async () => {
    if (!walletAddress || !password) return;
    setError("");
    setLoading(true);

    try {
      const phantom = getPhantom();
      if (!phantom) throw new Error("Phantom not available");

      // 1. Get nonce from server
      const nonceRes = await fetch(`/api/admin/auth?wallet=${walletAddress}`);
      const nonceJson = await nonceRes.json();
      if (!nonceJson.nonce) throw new Error("Failed to get nonce");

      // 2. Sign message with Phantom (ed25519)
      const timestamp = Math.floor(Date.now() / 1000);
      const message = `HUMANOFI_ADMIN:${nonceJson.nonce}:${timestamp}`;
      const messageBytes = new TextEncoder().encode(message);
      const { signature: signatureBytes } = await phantom.signMessage(messageBytes, "utf8");
      const signature = encodeBase58(signatureBytes);

      // 3. Submit to server
      const loginRes = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, signature, message, password }),
      });

      if (!loginRes.ok) {
        setError("Authentication failed");
        setLoading(false);
        return;
      }

      router.push("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login__card">
        <div className="admin-login__logo">◈</div>
        <h1 className="admin-login__title">Humanofi Admin</h1>
        <p className="admin-login__subtitle">Restricted access — Authorized wallets only</p>

        <div className="admin-login__divider" />

        {!walletAddress ? (
          <>
            <button className="btn-solid admin-login__btn" onClick={connectWallet}>
              Connect Phantom Wallet
            </button>
            {error && <div className="admin-login__error">{error}</div>}
          </>
        ) : (
          <>
            <div className="admin-login__wallet">
              <span className="admin-login__wallet-label">WALLET</span>
              <span className="admin-login__wallet-address">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>

            <div className="admin-login__field">
              <label className="admin-login__field-label">PASSWORD</label>
              <input
                type="password"
                className="admin-login__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                autoComplete="off"
              />
            </div>

            {error && <div className="admin-login__error">{error}</div>}

            <button
              className="btn-solid admin-login__btn"
              onClick={handleLogin}
              disabled={loading || !password}
              style={{ opacity: loading || !password ? 0.5 : 1 }}
            >
              {loading ? "Authenticating..." : "Sign & Login"}
            </button>
          </>
        )}

        <p className="admin-login__footer">
          Authentication requires wallet signature + password verification.
          <br />
          All access attempts are logged.
        </p>
      </div>
    </div>
  );
}
