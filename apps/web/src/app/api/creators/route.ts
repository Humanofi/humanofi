// ========================================
// Humanofi — Creators API
// ========================================
// GET  /api/creators       → List all creator tokens
// POST /api/creators       → Register new creator (after token creation)
//
// SECURITY: POST verifies on-chain that:
//   1. The mint exists (Token-2022)
//   2. The mint's authority is the Humanofi bonding curve PDA
//   3. The wallet is the on-chain creator of the token

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyHumanofiToken } from "@/lib/solana/verify";

/**
 * GET /api/creators
 * Returns all creator tokens with holder counts.
 */
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category");
  const mint = searchParams.get("mint");
  const ALLOWED_SORTS = ["activity_score", "created_at", "display_name", "holder_count"];
  const rawSort = searchParams.get("sort") || "activity_score";
  const sortBy = ALLOWED_SORTS.includes(rawSort) ? rawSort : "activity_score";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50") || 50, 200);

  let query = supabase
    .from("creator_tokens")
    .select("*")
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (mint) {
    query = query.eq("mint_address", mint);
  }

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If fetching a single creator, compute live holder_count
  if (mint && data && data.length > 0) {
    const { count: liveCount } = await supabase
      .from("token_holders")
      .select("*", { count: "exact", head: true })
      .eq("mint_address", mint)
      .gt("balance", 0);

    let holderCount = liveCount ?? 0;

    // Fallback: count distinct buyers from trades if token_holders is empty
    if (holderCount === 0) {
      const { data: buyers } = await supabase
        .from("trades")
        .select("wallet_address")
        .eq("mint_address", mint)
        .eq("trade_type", "buy");
      if (buyers) {
        holderCount = new Set(buyers.map((b: { wallet_address: string }) => b.wallet_address)).size;
      }
    }

    data[0].holder_count = Math.max(holderCount, data[0].holder_count ?? 0);
  }

  return NextResponse.json({ creators: data || [] });
}

/**
 * POST /api/creators
 * Register a new creator profile after on-chain token creation.
 *
 * THIS ENDPOINT VERIFIES ON-CHAIN:
 *   1. Mint exists + is Token-2022
 *   2. Mint authority = Humanofi bonding curve PDA
 *   3. BondingCurve.creator = wallet address
 *
 * Only after these 3 checks pass does it insert into Supabase.
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const {
      mintAddress,
      walletAddress,
      displayName,
      tokenSymbol,
      category,
      bio,
      avatarUrl,
      story,
      offer,
      country,
      socials,
    } = body;

    // Validate required fields
    if (!mintAddress || !walletAddress || !displayName || !category) {
      return NextResponse.json(
        { error: "Missing required fields: mintAddress, walletAddress, displayName, category" },
        { status: 400 }
      );
    }

    // ══════════════════════════════════════════════
    // ON-CHAIN VERIFICATION (Source of Truth)
    // ══════════════════════════════════════════════
    // This is the critical security check:
    // - Verifies the mint exists on Solana (Token-2022)
    // - Verifies mint authority = our bonding curve PDA (it's a Humanofi token)
    // - Verifies bondingCurve.creator == walletAddress (this wallet created it)
    console.log(`[Creators API] Verifying on-chain: mint=${mintAddress}, wallet=${walletAddress}`);

    const verification = await verifyHumanofiToken(mintAddress, walletAddress);

    if (!verification.valid) {
      console.error(`[Creators API] On-chain verification FAILED: ${verification.error}`);
      return NextResponse.json(
        { error: `On-chain verification failed: ${verification.error}` },
        { status: 403 }
      );
    }

    console.log(`[Creators API] On-chain verification PASSED ✅ Creator=${verification.creator}`);

    // ══════════════════════════════════════════════
    // DUPLICATE CHECK
    // ══════════════════════════════════════════════
    // Check if this wallet already has a token
    const { data: existingByWallet } = await supabase
      .from("creator_tokens")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (existingByWallet) {
      return NextResponse.json(
        { error: "This wallet already has a token." },
        { status: 409 }
      );
    }

    // Also check if this mint is already registered
    const { data: existingByMint } = await supabase
      .from("creator_tokens")
      .select("id")
      .eq("mint_address", mintAddress)
      .single();

    if (existingByMint) {
      return NextResponse.json(
        { error: "This token is already registered." },
        { status: 409 }
      );
    }

    // Check if token symbol is already taken
    if (tokenSymbol) {
      const { data: existingBySymbol } = await supabase
        .from("creator_tokens")
        .select("id")
        .eq("token_symbol", tokenSymbol.toUpperCase())
        .single();

      if (existingBySymbol) {
        return NextResponse.json(
          { error: `Token symbol $${tokenSymbol.toUpperCase()} is already taken.` },
          { status: 409 }
        );
      }
    }

    // ══════════════════════════════════════════════
    // INSERT (Only after on-chain verification)
    // ══════════════════════════════════════════════
    const lockUntil = new Date();
    lockUntil.setFullYear(lockUntil.getFullYear() + 1);

    const { data, error } = await supabase.from("creator_tokens").insert({
      mint_address: mintAddress,
      wallet_address: walletAddress,
      hiuid: walletAddress, // Beta: use wallet as temp hiuid — will be KYC hiuid in prod
      display_name: displayName,
      token_symbol: tokenSymbol ? tokenSymbol.toUpperCase() : null,
      category,
      bio: bio || "",
      story: story || "",
      offer: offer || "",
      avatar_url: avatarUrl || null,
      country_code: country || null,
      socials: socials || {},
      token_lock_until: lockUntil.toISOString(),
    });

    if (error) {
      console.error("Failed to create creator token:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Emit new_creator feed event (non-blocking) ──
    try {
      await supabase.from("feed_events").insert({
        event_type: "new_creator",
        mint_address: mintAddress,
        wallet_address: walletAddress,
        data: {
          display_name: displayName,
          category,
        },
      });
    } catch (feedErr) {
      console.warn("[Creators] Feed event error (non-blocking):", feedErr);
    }

    return NextResponse.json({
      success: true,
      message: "Creator profile registered (on-chain verified ✅)",
      creator: data,
      verification: {
        mint: verification.mint,
        creator: verification.creator,
        bondingCurve: verification.bondingCurve,
      },
    });
  } catch (error) {
    console.error("Creator registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
