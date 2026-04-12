// ========================================
// Humanofi — Bonding Curve WebSocket Subscription
// ========================================
// Subscribes to on-chain bonding curve PDA changes via Solana WebSocket.
// Every buy/sell modifies the PDA → this hook fires instantly.
// 
// This is the SINGLE SOURCE OF TRUTH for live price data.
// No polling, no API calls — direct from the blockchain.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshAccountsCoder } from "@coral-xyz/anchor";
import idl from "@/idl/humanofi.json";

const PROGRAM_ID = new PublicKey(idl.address);
const SEED_CURVE = Buffer.from("curve");

export interface LiveCurveData {
  mint: string;
  creator: string;
  x: number;       // u128 as number (risky for very large values, but fine for display)
  y: number;       // u128 as number
  k: string;       // u128 as string (to avoid precision loss)
  supplyPublic: number;
  supplyCreator: number;
  supplyProtocol: number;
  solReserve: number;   // lamports
  depthParameter: number;
  tradeCount: number;
  createdAt: number;
  isActive: boolean;
  // Derived
  priceSol: number;     // SOL per display token
  timestamp: number;    // when we received this update
}

/**
 * Decode raw bonding curve account data using Anchor's Borsh coder.
 */
function decodeBondingCurve(data: Buffer): LiveCurveData | null {
  try {
    const coder = new BorshAccountsCoder(idl as never);
    const decoded = coder.decode("BondingCurve", data) as Record<string, unknown>;

    const x = Number(decoded.x?.toString() || "0");
    const y = Number(decoded.y?.toString() || "0");
    const priceSol = y > 0 ? (x / y) * 1e6 / 1e9 : 0;

    return {
      mint: (decoded.mint as PublicKey).toBase58(),
      creator: (decoded.creator as PublicKey).toBase58(),
      x,
      y,
      k: decoded.k?.toString() || "0",
      supplyPublic: Number(decoded.supplyPublic?.toString() || "0"),
      supplyCreator: Number(decoded.supplyCreator?.toString() || "0"),
      supplyProtocol: Number(decoded.supplyProtocol?.toString() || "0"),
      solReserve: Number(decoded.solReserve?.toString() || "0"),
      depthParameter: Number(decoded.depthParameter?.toString() || "0"),
      tradeCount: Number(decoded.tradeCount?.toString() || "0"),
      createdAt: Number(decoded.createdAt?.toString() || "0"),
      isActive: decoded.isActive as boolean,
      priceSol,
      timestamp: Date.now(),
    };
  } catch (err) {
    console.error("[WS] Failed to decode bonding curve:", err);
    return null;
  }
}

interface UseBondingCurveWsOptions {
  mintAddress: string | null;
  onUpdate?: (data: LiveCurveData) => void;
}

/**
 * Hook that subscribes to a bonding curve PDA via Solana WebSocket.
 * Returns the latest curve data, updated in real-time.
 */
export function useBondingCurveWs({ mintAddress, onUpdate }: UseBondingCurveWsOptions) {
  const [curveData, setCurveData] = useState<LiveCurveData | null>(null);
  const [connected, setConnected] = useState(false);
  const subscriptionRef = useRef<number | null>(null);
  const connectionRef = useRef<Connection | null>(null);
  const onUpdateRef = useRef(onUpdate);
  
  // Keep callback ref fresh
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Initial fetch (before any WebSocket update arrives)
  const fetchInitial = useCallback(async (conn: Connection, pda: PublicKey) => {
    try {
      const info = await conn.getAccountInfo(pda);
      if (info?.data) {
        const decoded = decodeBondingCurve(info.data as Buffer);
        if (decoded) {
          setCurveData(decoded);
          onUpdateRef.current?.(decoded);
        }
      }
    } catch (err) {
      console.warn("[WS] Initial fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!mintAddress) return;

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    // Create a WebSocket-enabled connection
    const wsUrl = rpcUrl.replace("https://", "wss://").replace("http://", "ws://");
    const conn = new Connection(rpcUrl, {
      commitment: "confirmed",
      wsEndpoint: wsUrl,
    });
    connectionRef.current = conn;

    const mintPubkey = new PublicKey(mintAddress);
    const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
      [SEED_CURVE, mintPubkey.toBuffer()],
      PROGRAM_ID
    );

    console.log(`[WS] Subscribing to bonding curve: ${bondingCurvePDA.toBase58()}`);

    // Fetch initial state
    fetchInitial(conn, bondingCurvePDA);

    // Subscribe to account changes
    const subId = conn.onAccountChange(
      bondingCurvePDA,
      (accountInfo) => {
        const decoded = decodeBondingCurve(accountInfo.data as Buffer);
        if (decoded) {
          console.log(`[WS] 📊 Price update: ${decoded.priceSol.toFixed(8)} SOL | trades: ${decoded.tradeCount}`);
          setCurveData(decoded);
          onUpdateRef.current?.(decoded);
        }
      },
      "confirmed"
    );

    subscriptionRef.current = subId;
    setConnected(true);

    return () => {
      console.log("[WS] Unsubscribing from bonding curve");
      if (subscriptionRef.current !== null) {
        conn.removeAccountChangeListener(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      setConnected(false);
    };
  }, [mintAddress, fetchInitial]);

  return {
    curveData,
    connected,
    priceSol: curveData?.priceSol || 0,
  };
}
