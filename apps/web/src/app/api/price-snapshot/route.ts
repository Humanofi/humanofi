// ========================================
// Humanofi — Price Snapshot API (Authenticated)
// ========================================
// POST /api/price-snapshot
// Receives price data from the frontend after a trade
// and saves it to Supabase for chart history.
//
// SECURITY: Requires authentication (Privy JWT or dev fallback).
// Only authenticated users who just completed a trade should call this.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // ── AUTHENTICATION ──
  const auth = await verifyRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { error: auth.error || "Authentication required" },
      { status: 401 }
    );
  }

  try {
    const { mintAddress, priceSol, supply, solReserve } = await request.json();

    if (!mintAddress || priceSol === undefined) {
      return NextResponse.json({ error: "mintAddress and priceSol required" }, { status: 400 });
    }

    const { error: insertError } = await supabase
      .from("price_snapshots")
      .insert({
        mint_address: mintAddress,
        price_sol: priceSol,
        supply: supply || 0,
        sol_reserve: solReserve || 0,
        holder_count: 0,
        source: "trade",
      });

    if (insertError) {
      console.error("[PriceSnapshot] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, price_sol: priceSol });
  } catch (error) {
    console.error("[PriceSnapshot] Error:", error);
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 });
  }
}
