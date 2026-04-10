// ========================================
// Humanofi — Supabase Auth Sync Hook
// ========================================
// Synchronizes Privy wallet auth with Supabase.
//
// After Privy login:
//   1. Calls /api/auth/session to create user profile
//   2. Gets a Supabase JWT back
//   3. Sets Supabase session so client-side queries work with RLS
//   4. Exposes user state (isVerified, isCreator, etc.)

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

export function useSupabaseAuth() {
  const { authenticated, user, getAccessToken } = usePrivy();
  const [humanofiUser, setHumanofiUser] = useState<HumanofiUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [synced, setSynced] = useState(false);
  const syncingRef = useRef(false);

  // Get wallet address from Privy user object
  // In solana-only mode, user.wallet contains the Solana wallet
  const walletAddress = user?.wallet?.address || null;

  /**
   * Sync Privy auth state with Supabase.
   * Creates profile, gets JWT, sets Supabase session.
   */
  const syncSession = useCallback(async () => {
    if (!authenticated || !walletAddress || syncingRef.current) return;

    syncingRef.current = true;
    setLoading(true);

    try {
      // Get Privy access token for server-side verification
      const accessToken = await getAccessToken();

      // Call our API to sync with Supabase
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          walletAddress,
        }),
      });

      if (!response.ok) {
        console.error("[Auth] Session sync failed:", response.status);
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
      setSynced(true);

      console.log(
        `[Humanofi] Auth synced: ${walletAddress.slice(0, 8)}...`,
        data.user.isVerified ? "✅ KYC" : "⏳ No KYC",
        data.user.isCreator ? "🎨 Creator" : ""
      );
    } catch (error) {
      console.error("[Auth] Sync error:", error);
    } finally {
      setLoading(false);
      syncingRef.current = false;
    }
  }, [authenticated, walletAddress, getAccessToken]);

  // Auto-sync when Privy auth state changes
  useEffect(() => {
    if (authenticated && walletAddress && !synced) {
      syncSession();
    }

    // Clear state on logout
    if (!authenticated) {
      setHumanofiUser(null);
      setSynced(false);
      if (supabase) {
        supabase.auth.signOut();
      }
    }
  }, [authenticated, walletAddress, synced, syncSession]);

  return {
    /** The connected and synced Humanofi user */
    user: humanofiUser,
    /** Wallet address (available before sync) */
    walletAddress,
    /** Whether Privy auth is active */
    authenticated,
    /** Whether the Supabase sync is in progress */
    loading,
    /** Whether the session has been synced with Supabase */
    synced,
    /** Manually trigger a re-sync (e.g., after KYC completes) */
    resync: () => {
      setSynced(false);
      syncingRef.current = false;
    },
  };
}
