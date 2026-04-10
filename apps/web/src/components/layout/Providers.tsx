// ========================================
// Humanofi — Root Providers
// ========================================
// Wraps the entire app with:
//   1. Privy (wallet/auth)
//   2. AuthSync (Privy → Supabase session sync)
//   3. Sonner (toast notifications)

"use client";

import { PrivyWalletProvider } from "./PrivyWalletProvider";
import { AuthSyncProvider } from "./AuthSyncProvider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyWalletProvider>
      <AuthSyncProvider>
        {children}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: {
              borderRadius: 0,
              border: "2px solid #111",
              fontFamily: "var(--font-sans)",
              fontWeight: 700,
            },
          }}
        />
      </AuthSyncProvider>
    </PrivyWalletProvider>
  );
}
