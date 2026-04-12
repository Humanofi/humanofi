// ========================================
// Humanofi — Authenticated Fetch Helper
// ========================================
// Wraps the native fetch() with Privy JWT token for secure API calls.
//
// Usage in components (with usePrivy):
//   const { getAccessToken } = usePrivy();
//   const fetcher = useAuthFetch();
//   await fetcher("/api/trades", { method: "POST", body: ... });
//
// The token is automatically added as Authorization: Bearer <token>.
// Falls back to x-wallet-address header only in development without Privy.

"use client";

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";

/**
 * Hook that returns an authenticated fetch function.
 * Automatically attaches Privy JWT to all requests.
 */
export function useAuthFetch() {
  const { getAccessToken } = usePrivy();
  const { walletAddress } = useHumanofi();

  const authFetch = useCallback(
    async (url: string, options?: RequestInit): Promise<Response> => {
      const headers = new Headers(options?.headers);

      // Always try to get a fresh Privy JWT
      try {
        const token = await getAccessToken();
        if (token) {
          headers.set("Authorization", `Bearer ${token}`);
        }
      } catch {
        // Privy not configured or token refresh failed
        console.warn("[authFetch] Could not get Privy token");
      }

      // Always send wallet address as backup identifier
      // (the server will prefer JWT when available)
      if (walletAddress) {
        headers.set("x-wallet-address", walletAddress);
      }

      // Ensure content-type for JSON bodies
      if (options?.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [getAccessToken, walletAddress]
  );

  return authFetch;
}
