// ========================================
// Humanofi — Privy Provider
// ========================================
// Replaces the old WalletProvider with Privy for
// embedded wallets + social login + Phantom/Solflare support.
//
// Uses config.solana.rpcs with @solana/kit as per Privy v3 docs.
// Both mainnet + devnet RPCs are required by Privy.

"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const solanaConnectors = toSolanaWalletConnectors({
  // false = don't auto-probe browser extensions on page load.
  // Privy handles session persistence for embedded wallets internally.
  // External wallets (Phantom) reconnect via Privy's auth state, not via extension probing.
  shouldAutoConnect: false,
});

// Triton RPCs from env
const DEVNET_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const MAINNET_RPC = process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || "https://api.mainnet-beta.solana.com";

interface PrivyWalletProviderProps {
  children: React.ReactNode;
}

export function PrivyWalletProvider({ children }: PrivyWalletProviderProps) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    console.warn("[Humanofi] NEXT_PUBLIC_PRIVY_APP_ID not set — running without auth");
    return <>{children}</>;
  }

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
        // Privy v3: Solana RPC config via @solana/kit
        solana: {
          // @ts-expect-error — defaultChain exists at runtime but Privy types don't export it yet
          defaultChain: "solana:devnet",
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc(MAINNET_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                MAINNET_RPC.replace("https://", "wss://")
              ),
            },
            "solana:devnet": {
              rpc: createSolanaRpc(DEVNET_RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(
                DEVNET_RPC.replace("https://", "wss://")
              ),
            },
          },
        },
        // Enable fiat on-ramp (MoonPay) for SOL purchases
        fundingMethodsConfig: {
          moonpay: {
            useSandboxEnvironment: DEVNET_RPC.includes("devnet"),
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
