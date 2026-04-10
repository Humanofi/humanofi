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
//
// Handles reconnection gracefully:
//   - Retries on failure with exponential backoff
//   - Re-syncs when Privy token refreshes
//   - Clears stale state on server restart

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
  // If we have a cached user, consider ourselves "synced" immediately
  // This prevents the re-sync flash on page reload
  const [synced, setSynced] = useState(() => getCachedUser() !== null);
  const syncingRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get wallet address from Privy user object
  const walletAddress = user?.wallet?.address || null;

  /**
   * Sync Privy auth state with Supabase.
   * Creates profile, gets JWT, sets Supabase session.
   * Retries with exponential backoff on failure.
   */
  const syncSession = useCallback(async () => {
    if (!authenticated || !walletAddress || syncingRef.current) return;

    syncingRef.current = true;
    setLoading(true);

    try {
      // Get a FRESH Privy access token (forces refresh if expired)
      const accessToken = await getAccessToken();

      if (!accessToken) {
        console.warn("[Auth] No access token available — skipping sync");
        return;
      }

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
        // Handle specific error codes
        if (response.status === 401) {
          console.warn("[Auth] Token expired or invalid — will retry with fresh token");
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
            syncSession();
          }, delay);
        } else {
          console.error("[Auth] Max retries reached — sync abandoned. User can manually refresh.");
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
      retryCountRef.current = 0; // Reset retries on success

      console.log(
        `[Humanofi] Auth synced: ${walletAddress.slice(0, 8)}...`,
        data.user.isVerified ? "✅ KYC" : "⏳ No KYC",
        data.user.isCreator ? "🎨 Creator" : ""
      );
    } catch (error) {
      console.error("[Auth] Sync error:", error);

      // Network errors → retry
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, retryCountRef.current);
        retryCountRef.current++;
        console.log(`[Auth] Network error — retrying in ${delay / 1000}s (attempt ${retryCountRef.current}/${MAX_RETRIES})`);

        retryTimerRef.current = setTimeout(() => {
          syncingRef.current = false;
          syncSession();
        }, delay);
      }
    } finally {
      setLoading(false);
      syncingRef.current = false;
    }
  }, [authenticated, walletAddress, getAccessToken]);

  // Auto-sync when Privy becomes ready + authenticated
  useEffect(() => {
    // Don't do anything until Privy SDK is fully loaded
    if (!ready) return;

    if (authenticated && walletAddress) {
      // Privy is ready and user is authenticated — sync if needed
      if (!synced) {
        syncSession();
      }
    } else {
      // Privy is READY but user is NOT authenticated = intentional logout
      // (Not a reload — Privy would be authenticated after ready on reload)
      setHumanofiUser(null);
      setCachedUser(null);
      setSynced(false);
      retryCountRef.current = 0;

      // Clear any pending retry
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (supabase) {
        supabase.auth.signOut();
      }
    }
  }, [ready, authenticated, walletAddress, synced, syncSession]);

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

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
    /** Manually trigger a re-sync (e.g., after KYC or server restart) */
    resync: () => {
      setSynced(false);
      syncingRef.current = false;
      retryCountRef.current = 0;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    },
  };
}
