// ========================================
// Humanofi — Auth Sync Provider
// ========================================
// Wraps the app to auto-sync Privy → Supabase on login.
// Provides HumanofiUser context to all components.

"use client";

import { createContext, useContext } from "react";
import { useSupabaseAuth, type HumanofiUser } from "@/hooks/useSupabaseAuth";

interface AuthContextValue {
  user: HumanofiUser | null;
  walletAddress: string | null;
  authenticated: boolean;
  loading: boolean;
  synced: boolean;
  resync: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  walletAddress: null,
  authenticated: false,
  loading: false,
  synced: false,
  resync: () => {},
});

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const auth = useSupabaseAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access the Humanofi auth state from any component.
 *
 * @example
 * const { user, walletAddress, authenticated } = useHumanofiAuth();
 * if (user?.isCreator) { ... }
 */
export function useHumanofiAuth() {
  return useContext(AuthContext);
}
