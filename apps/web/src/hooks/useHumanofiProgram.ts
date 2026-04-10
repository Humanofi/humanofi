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
  const { user, authenticated } = usePrivy();
  const { wallets, ready } = useWallets();

  const walletAddress = useMemo(() => {
    // Get wallet address from Privy user object
    const addr = (user as { wallet?: { address?: string } } | null)?.wallet?.address || null;
    return addr;
  }, [user]);

  const connection = useMemo(() => {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.devnet.solana.com";
    return new Connection(rpcUrl, { commitment: "confirmed" });
  }, []);

  const { program, publicKey } = useMemo(() => {
    if (!walletAddress || !authenticated || !ready || wallets.length === 0) {
      return { program: null, publicKey: null };
    }

    // Find the matching Privy wallet
    const privyWallet = wallets.find(w => w.address === walletAddress);
    if (!privyWallet) {
      return { program: null, publicKey: null };
    }

    const pubKey = new PublicKey(walletAddress);

    // Build an Anchor-compatible wallet adapter
    const anchorWallet = {
      publicKey: pubKey,

      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        // Serialize the transaction to Uint8Array
        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false } as never);
        
        // Use Privy's signTransaction which expects Uint8Array
        const { signedTransaction } = await privyWallet.signTransaction({
          transaction: serialized,
        });

        // Deserialize back to the correct type
        if (tx instanceof VersionedTransaction) {
          return VersionedTransaction.deserialize(signedTransaction) as T;
        } else {
          return Transaction.from(signedTransaction) as T;
        }
      },

      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        const signed = await Promise.all(txs.map(async (tx) => {
          const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false } as never);
          const { signedTransaction } = await privyWallet.signTransaction({
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
  }, [walletAddress, authenticated, ready, wallets, connection]);

  return {
    program,
    connection,
    publicKey,
    walletAddress,
    connected: !!publicKey,
  };
}
