// ========================================
// Humanofi — Portfolio API
// ========================================
// GET /api/portfolio?wallet=...          → all positions for a wallet
// GET /api/portfolio?wallet=...&mint=... → single position for a specific token
//
// Strategy:
//  1. Fetch trades (always reliable — recorded at buy/sell time)
//  2. Aggregate by mint: tokens bought/sold, SOL invested/recovered
//  3. Fetch creator metadata separately (no fragile JOIN)
//  4. Optionally enrich with token_holders balance (if Helius webhook active)
//
// Zero on-chain calls. Price enrichment done client-side.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");
  const mint = searchParams.get("mint"); // Optional: filter to a single token

  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 });
  }

  try {
    // ── 1. Fetch all trades for this wallet ──
    let tradesQuery = supabase
      .from("trades")
      .select("mint_address, trade_type, sol_amount, token_amount, price_sol, created_at")
      .eq("wallet_address", wallet);

    if (mint) {
      tradesQuery = tradesQuery.eq("mint_address", mint);
    }

    const { data: trades, error: tradesError } = await tradesQuery;

    if (tradesError) {
      console.error("[Portfolio] Trades error:", tradesError);
      return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
    }

    if (!trades || trades.length === 0) {
      return NextResponse.json({ wallet, positions: [], total_positions: 0 });
    }

    // ── 2. Aggregate trades by mint ──
    interface TradeAgg {
      sol_invested: number;
      sol_recovered: number;
      tokens_bought: number;
      tokens_sold: number;
      buy_count: number;
      sell_count: number;
      first_trade_at: string;
      last_trade_at: string;
      last_price: number;
    }

    const tradesByMint: Record<string, TradeAgg> = {};

    for (const trade of trades) {
      const key = trade.mint_address;
      if (!tradesByMint[key]) {
        tradesByMint[key] = {
          sol_invested: 0,
          sol_recovered: 0,
          tokens_bought: 0,
          tokens_sold: 0,
          buy_count: 0,
          sell_count: 0,
          first_trade_at: trade.created_at,
          last_trade_at: trade.created_at,
          last_price: 0,
        };
      }
      const agg = tradesByMint[key];

      if (trade.trade_type === "buy") {
        agg.sol_invested += trade.sol_amount;
        agg.tokens_bought += trade.token_amount;
        agg.buy_count++;
      } else {
        agg.sol_recovered += trade.sol_amount;
        agg.tokens_sold += trade.token_amount;
        agg.sell_count++;
      }

      // Track timestamps
      if (trade.created_at < agg.first_trade_at) agg.first_trade_at = trade.created_at;
      if (trade.created_at > agg.last_trade_at) {
        agg.last_trade_at = trade.created_at;
        agg.last_price = trade.price_sol;
      }
    }

    // ── 3. Get unique mints and fetch creator metadata ──
    const mintAddresses = Object.keys(tradesByMint);

    const { data: creators } = await supabase
      .from("creator_tokens")
      .select("mint_address, display_name, avatar_url, category, token_color, activity_score, activity_status")
      .in("mint_address", mintAddresses);

    const creatorsMap: Record<string, typeof creators extends (infer T)[] | null ? T : never> = {};
    for (const c of (creators || [])) {
      creatorsMap[c.mint_address] = c;
    }

    // ── 4. Optionally fetch token_holders balances (if available) ──
    const { data: holdings } = await supabase
      .from("token_holders")
      .select("mint_address, balance")
      .eq("wallet_address", wallet)
      .in("mint_address", mintAddresses)
      .gt("balance", 0);

    const holdingsMap: Record<string, number> = {};
    for (const h of (holdings || [])) {
      holdingsMap[h.mint_address] = h.balance;
    }

    // ── 5. Build positions ──
    const positions = mintAddresses
      .map((mintAddr) => {
        const agg = tradesByMint[mintAddr];
        const creator = creatorsMap[mintAddr];

        // Balance: prefer token_holders (Helius webhook), fallback to trades delta
        const webhookBalance = holdingsMap[mintAddr];
        const tradeBalance = agg.tokens_bought - agg.tokens_sold;
        const balance = webhookBalance !== undefined ? webhookBalance : Math.max(0, tradeBalance);

        // Skip positions with 0 balance
        if (balance <= 0) return null;

        // Average entry price
        const avg_entry_price = agg.tokens_bought > 0
          ? agg.sol_invested / agg.tokens_bought
          : 0;

        return {
          mint_address: mintAddr,
          balance,                          // base units (6 decimals)
          first_bought_at: agg.first_trade_at,
          // Trade history
          sol_invested: agg.sol_invested,   // lamports
          sol_recovered: agg.sol_recovered, // lamports
          tokens_bought: agg.tokens_bought, // base units
          tokens_sold: agg.tokens_sold,
          buy_count: agg.buy_count,
          sell_count: agg.sell_count,
          avg_entry_price,                  // lamports per base unit
          last_trade_at: agg.last_trade_at,
          last_price: agg.last_price,
          // Creator metadata
          display_name: creator?.display_name || "Unknown",
          avatar_url: creator?.avatar_url || null,
          category: creator?.category || "other",
          token_color: creator?.token_color || "blue",
          activity_score: creator?.activity_score || 0,
          activity_status: creator?.activity_status || "moderate",
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      wallet,
      positions,
      total_positions: positions.length,
    });
  } catch (error) {
    console.error("[Portfolio] Error:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 });
  }
}
