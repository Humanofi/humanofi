// ========================================
// Humanofi — Privy ↔ Anchor Bridge
// ========================================
// Creates an AnchorProvider from a Privy Solana wallet.
// Handles the impedance mismatch between Privy's signTransaction
// (Uint8Array in/out) and Anchor's expected wallet interface.

"use client";

import { useMemo } from "react";
import { Connection, PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { useWallets } from "@privy-io/react-auth/solana";
import { usePrivy } from "@privy-io/react-auth";
import idl from "@/idl/humanofi.json";

export const PROGRAM_ID = new PublicKey(idl.address);

/**
 * Hook that provides a working Anchor program + connection
 * by bridging Privy's wallet interface to Anchor's expected format.
 *
 * Returns { program, connection, walletAddress, connected }
 */
export function useHumanofiProgram() {
  const { authenticated } = usePrivy();
  const { wallets, ready } = useWallets();

  // Prefer external wallets (Phantom, Solflare) over Privy embedded wallet.
  // Privy's embedded wallet has 0 SOL by default — using it for transactions fails.
  const activeWallet = useMemo(() => {
    if (!ready || wallets.length === 0) return null;

    // Log all available wallets for debugging
    if (wallets.length > 0) {
      console.log(`[Humanofi] Available wallets (${wallets.length}):`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallets.map((w: any, i: number) => `[${i}] ${w.address.slice(0, 8)}... type=${w.walletClientType || 'unknown'}`).join(', ')
      );
    }

    // Prefer external wallet (Phantom, Solflare, etc.) over embedded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const external = wallets.find((w: any) => w.walletClientType !== 'privy');
    if (external) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      console.log(`[Humanofi] Using external wallet: ${external.address.slice(0, 8)}... (${(external as any).walletClientType})`);
      return external;
    }

    // Fallback to first available (embedded)
    console.log(`[Humanofi] Using embedded wallet: ${wallets[0].address.slice(0, 8)}...`);
    return wallets[0];
  }, [ready, wallets]);

  const walletAddress = activeWallet?.address || null;

  const connection = useMemo(() => {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.devnet.solana.com";
    return new Connection(rpcUrl, { commitment: "confirmed" });
  }, []);

  const { program, publicKey } = useMemo(() => {
    if (!activeWallet || !authenticated || !ready) {
      // Still create a read-only program for fetching bonding curve data
      try {
        const readOnlyProvider = new AnchorProvider(
          connection,
          {
            publicKey: PublicKey.default,
            signTransaction: async <T,>(t: T): Promise<T> => t,
            signAllTransactions: async <T,>(t: T): Promise<T> => t,
          } as never,
          { commitment: "confirmed" }
        );
        const prog = new Program(idl as never, readOnlyProvider);
        return { program: prog, publicKey: null };
      } catch {
        return { program: null, publicKey: null };
      }
    }

    const pubKey = new PublicKey(activeWallet.address);

    // Build an Anchor-compatible wallet adapter
    const anchorWallet = {
      publicKey: pubKey,

      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false } as never);
        const { signedTransaction } = await activeWallet.signTransaction({
          transaction: serialized,
        });
        if (tx instanceof VersionedTransaction) {
          return VersionedTransaction.deserialize(signedTransaction) as T;
        } else {
          return Transaction.from(signedTransaction) as T;
        }
      },

      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        const signed = await Promise.all(txs.map(async (tx) => {
          const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false } as never);
          const { signedTransaction } = await activeWallet.signTransaction({
            transaction: serialized,
          });
          if (tx instanceof VersionedTransaction) {
            return VersionedTransaction.deserialize(signedTransaction) as T;
          } else {
            return Transaction.from(signedTransaction) as T;
          }
        }));
        return signed;
      },
    };

    try {
      const provider = new AnchorProvider(connection, anchorWallet as never, {
        commitment: "confirmed",
        preflightCommitment: "confirmed",
      });
      const prog = new Program(idl as never, provider);
      return { program: prog, publicKey: pubKey };
    } catch (e) {
      console.error("[useHumanofiProgram] Failed to create Anchor program:", e);
      return { program: null, publicKey: null };
    }
  }, [activeWallet, authenticated, ready, connection]);

  return {
    program,
    connection,
    publicKey,
    walletAddress,
    connected: !!publicKey,
  };
}
