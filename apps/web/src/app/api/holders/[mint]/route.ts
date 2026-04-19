// ========================================
// Humanofi — Holders API
// ========================================
// GET /api/holders/[mint] → top holders for a token
// Params: limit (default 10), wallet (optional: get rank for specific wallet)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { generateIdenticon, getDefaultDisplayName } from "@/lib/identicon";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const { mint } = await params;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);
  const walletParam = searchParams.get("wallet"); // optional: get rank for this wallet

  try {
    // Fetch top holders
    const { data: holders, error } = await supabase
      .from("token_holders")
      .select("wallet_address, balance, holder_rank, is_early_believer, first_bought_at")
      .eq("mint_address", mint)
      .gt("balance", 0)
      .order("balance", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[Holders] Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with profile data
    const wallets = (holders || []).map((h) => h.wallet_address);
    let profilesMap: Record<string, { display_name: string; avatar_url: string | null }> = {};

    if (wallets.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("wallet_address, display_name, avatar_url")
        .in("wallet_address", wallets);

      for (const p of profiles || []) {
        profilesMap[p.wallet_address] = {
          display_name: p.display_name || getDefaultDisplayName(p.wallet_address),
          avatar_url: p.avatar_url || generateIdenticon(p.wallet_address),
        };
      }
    }

    // Build response
    const enrichedHolders = (holders || []).map((h, i) => ({
      wallet_address: h.wallet_address,
      balance: h.balance,
      rank: h.holder_rank || i + 1,
      is_early_believer: h.is_early_believer || false,
      first_bought_at: h.first_bought_at,
      display_name: profilesMap[h.wallet_address]?.display_name || getDefaultDisplayName(h.wallet_address),
      avatar_url: profilesMap[h.wallet_address]?.avatar_url || generateIdenticon(h.wallet_address),
    }));

    // Total holder count
    const { count: totalHolders } = await supabase
      .from("token_holders")
      .select("id", { count: "exact", head: true })
      .eq("mint_address", mint)
      .gt("balance", 0);

    // If wallet param provided, get that wallet's rank
    let myRank: { rank: number; balance: number; is_early_believer: boolean } | null = null;
    if (walletParam) {
      const { data: myHolder } = await supabase
        .from("token_holders")
        .select("balance, holder_rank, is_early_believer")
        .eq("mint_address", mint)
        .eq("wallet_address", walletParam)
        .gt("balance", 0)
        .single();

      if (myHolder) {
        // If holder_rank not calculated yet, compute it
        let rank = myHolder.holder_rank;
        if (!rank) {
          const { count } = await supabase
            .from("token_holders")
            .select("id", { count: "exact", head: true })
            .eq("mint_address", mint)
            .gt("balance", myHolder.balance);
          rank = (count || 0) + 1;
        }
        myRank = {
          rank,
          balance: myHolder.balance,
          is_early_believer: myHolder.is_early_believer || false,
        };
      }
    }

    return NextResponse.json({
      holders: enrichedHolders,
      totalHolders: totalHolders || 0,
      myRank,
    });
  } catch (error) {
    console.error("[Holders] Error:", error);
    return NextResponse.json({ error: "Failed to fetch holders" }, { status: 500 });
  }
}
