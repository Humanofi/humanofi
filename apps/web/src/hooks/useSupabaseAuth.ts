// ========================================
// Humanofi — Supabase Auth Sync Hook (v3.7)
// ========================================
// Synchronizes Privy wallet auth with Supabase.
//
// After Privy login:
//   1. Calls /api/auth/session to create user profile
//   2. Gets a Supabase JWT back
//   3. Sets Supabase session so client-side queries work with RLS
//   4. Exposes user state (isVerified, isCreator, etc.)
//
// v3.7: Refactored to eliminate re-render loops:
//   - syncSession is NOT in useEffect deps (called inline via ref)
//   - synced state uses ref to avoid triggering re-render cycle
//   - walletAddress stabilized via ref to prevent flickering

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { supabase } from "@/lib/supabase/client";

export interface HumanofiUser {
  walletAddress: string;
  privyUserId: string | null;
  isVerified: boolean;
  isCreator: boolean;
  hiuid: string | null;
  hasToken: boolean;
  countryCode: string | null;
  creator: {
    mint_address: string;
    display_name: string;
    category: string;
  } | null;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000;
const SESSION_KEY = "humanofi_user";

function getCachedUser(): HumanofiUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expire cache after 1 hour
    if (parsed._ts && Date.now() - parsed._ts > 3600000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    delete parsed._ts;
    return parsed as HumanofiUser;
  } catch { return null; }
}

function setCachedUser(user: HumanofiUser | null) {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...user, _ts: Date.now() }));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function useSupabaseAuth() {
  const { authenticated, user, ready, getAccessToken } = usePrivy();
  const [humanofiUser, setHumanofiUser] = useState<HumanofiUser | null>(() => getCachedUser());
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(() => getCachedUser() !== null);

  // ── Refs to break dependency cycles ──
  const syncedRef = useRef(synced);
  const syncingRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const getAccessTokenRef = useRef(getAccessToken);

  // Keep refs fresh without causing re-renders
  syncedRef.current = synced;
  getAccessTokenRef.current = getAccessToken;

  // Get wallet address from Privy user object
  const walletAddress = user?.wallet?.address || null;

  // Stabilize wallet address to prevent flickering during Privy init
  const stableWalletRef = useRef<string | null>(null);
  if (walletAddress) {
    stableWalletRef.current = walletAddress;
  }

  /**
   * Sync Privy auth state with Supabase.
   * Uses refs for deps to avoid being recreated on every render.
   */
  const syncSession = useCallback(async (wallet: string) => {
    if (syncingRef.current) return;

    syncingRef.current = true;
    setLoading(true);

    try {
      const accessToken = await getAccessTokenRef.current();

      if (!accessToken) {
        console.warn("[Auth] No access token available — skipping sync");
        return;
      }

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          walletAddress: wallet,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          console.warn("[Auth] Token expired or invalid");
        } else {
          console.error("[Auth] Session sync failed:", response.status);
        }

        // Schedule retry with exponential backoff
        if (retryCountRef.current < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY * Math.pow(2, retryCountRef.current);
          retryCountRef.current++;
          console.log(`[Auth] Retrying in ${delay / 1000}s (attempt ${retryCountRef.current}/${MAX_RETRIES})`);

          retryTimerRef.current = setTimeout(() => {
            syncingRef.current = false;
            syncSession(wallet);
          }, delay);
        } else {
          console.error("[Auth] Max retries reached — sync abandoned.");
          retryCountRef.current = 0;
        }
        return;
      }

      const data = await response.json();

      // Set Supabase session with the custom JWT
      if (supabase && data.supabaseToken) {
        await supabase.auth.setSession({
          access_token: data.supabaseToken,
          refresh_token: "", // No refresh for custom JWT
        });
      }

      // Update user state
      setHumanofiUser(data.user);
      setCachedUser(data.user);
      setSynced(true);
      syncedRef.current = true;
      retryCountRef.current = 0;

      console.log(
        `[Humanofi] Auth synced: ${wallet.slice(0, 8)}...`,
        data.user.isVerified ? "✅ KYC" : "⏳ No KYC",
        data.user.isCreator ? "🎨 Creator" : ""
      );
    } catch (error) {
      console.error("[Auth] Sync error:", error);

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(() => {
          syncingRef.current = false;
          syncSession(wallet);
        }, delay);
      }
    } finally {
      setLoading(false);
      syncingRef.current = false;
    }
  }, []); // ← NO dependencies: uses refs for everything

  // ── Main effect: sync when Privy becomes ready + authenticated ──
  // Dependencies are minimal: only real state changes trigger this.
  useEffect(() => {
    if (!ready) return;

    if (authenticated && walletAddress) {
      // Only sync once (ref prevents re-trigger)
      if (!syncedRef.current) {
        syncSession(walletAddress);
      }
    } else {
      // User logged out
      setHumanofiUser(null);
      setCachedUser(null);
      setSynced(false);
      syncedRef.current = false;
      retryCountRef.current = 0;
      stableWalletRef.current = null;

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (supabase) {
        supabase.auth.signOut();
      }
    }
  }, [ready, authenticated, walletAddress, syncSession]);

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  return {
    user: humanofiUser,
    walletAddress: stableWalletRef.current || walletAddress,
    authenticated,
    loading,
    synced,
    resync: () => {
      setSynced(false);
      syncedRef.current = false;
      syncingRef.current = false;
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    },
  };
}
