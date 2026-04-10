// ========================================
// Humanofi — Privy Provider
// ========================================
// Replaces the old WalletProvider with Privy for
// embedded wallets + social login + Phantom/Solflare support.

"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

interface PrivyWalletProviderProps {
  children: React.ReactNode;
}

export function PrivyWalletProvider({ children }: PrivyWalletProviderProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    // In development without Privy configured, render children directly
    console.warn("[Humanofi] NEXT_PUBLIC_PRIVY_APP_ID not set — running without auth");
    return <>{children}</>;
  }

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#1144ff",
          logo: "/Logo_noire.png",
          walletChainType: "solana-only",
        },
        loginMethods: ["email", "wallet", "twitter"],
        embeddedWallets: {
          solana: {
            createOnLogin: "users-without-wallets",
          },
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
        // Solana RPC endpoints — fixes "No RPC configuration found" error
        solanaClusters: [
          {
            name: "devnet",
            rpcUrl: rpcUrl,
          },
          {
            name: "mainnet-beta",
            rpcUrl: "https://api.mainnet-beta.solana.com",
          },
        ],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
