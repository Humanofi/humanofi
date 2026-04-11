// ========================================
// Humanofi — SOL/USD Price Hook (Realtime)
// ========================================
//
// Reads SOL/USD price from the oracle_prices table.
// Uses Supabase Realtime to get live updates every ~10 seconds.
//
// Usage:
//   const { priceUsd, confidence, loading } = useSolPrice();
//   const tokenValueUsd = tokenPriceSol * priceUsd;

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface SolPriceState {
  /** SOL price in USD */
  priceUsd: number;
  /** Price confidence interval in USD */
  confidence: number;
  /** Last update timestamp */
  updatedAt: string | null;
  /** Whether we're loading the initial price */
  loading: boolean;
}

export function useSolPrice(): SolPriceState {
  const [state, setState] = useState<SolPriceState>({
    priceUsd: 0,
    confidence: 0,
    updatedAt: null,
    loading: true,
  });

  useEffect(() => {
    // 1. Fetch initial price
    const fetchPrice = async () => {
      const { data, error } = await supabase
        .from("oracle_prices")
        .select("price_usd, confidence, updated_at")
        .eq("id", "SOL_USD")
        .single();

      if (data && !error) {
        setState({
          priceUsd: data.price_usd,
          confidence: data.confidence,
          updatedAt: data.updated_at,
          loading: false,
        });
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchPrice();

    // 2. Subscribe to realtime updates
    const channel = supabase
      .channel("oracle-sol-price")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "oracle_prices",
          filter: "id=eq.SOL_USD",
        },
        (payload) => {
          const row = payload.new as {
            price_usd: number;
            confidence: number;
            updated_at: string;
          };
          setState({
            priceUsd: row.price_usd,
            confidence: row.confidence,
            updatedAt: row.updated_at,
            loading: false,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return state;
}
