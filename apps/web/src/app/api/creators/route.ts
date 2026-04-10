// ========================================
// Humanofi — Creators API
// ========================================
// GET  /api/creators       → List all creator tokens
// POST /api/creators       → Register new creator (after token creation)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

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
  const sortBy = searchParams.get("sort") || "activity_score";
  const limit = parseInt(searchParams.get("limit") || "50");

  let query = supabase
    .from("creator_tokens")
    .select("*, token_holders(count)")
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ creators: data || [] });
}

/**
 * POST /api/creators
 * Register a new creator profile after on-chain token creation.
 *
 * Beta Devnet: KYC (hiuid) is optional.
 * When KYC is implemented, the flow will be:
 *   1. User completes KYC → gets hiuid
 *   2. hiuid is passed here → we verify it exists in verified_identities
 *   3. Only then can they create a token
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

    // Check if this wallet already has a token
    const { data: existing } = await supabase
      .from("creator_tokens")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "This wallet already has a token." },
        { status: 409 }
      );
    }

    // Calculate token lock date (1 year from now)
    const lockUntil = new Date();
    lockUntil.setFullYear(lockUntil.getFullYear() + 1);

    // Insert creator token record
    // hiuid is set to wallet address as temporary identifier (Beta)
    // Will be replaced by real KYC hiuid in production
    const { data, error } = await supabase.from("creator_tokens").insert({
      mint_address: mintAddress,
      wallet_address: walletAddress,
      hiuid: walletAddress, // Beta: use wallet as temp hiuid
      display_name: displayName,
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

    return NextResponse.json({
      success: true,
      message: "Creator profile registered",
      creator: data,
    });
  } catch (error) {
    console.error("Creator registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
