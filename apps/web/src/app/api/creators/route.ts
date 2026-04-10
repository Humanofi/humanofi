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
  const country = searchParams.get("country");
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

  // Note: country is stored in verified_identities, not creator_tokens directly
  // For simplicity, we'd need a join or denormalized field

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ creators: data || [] });
}

/**
 * POST /api/creators
 * Register a new creator profile after on-chain token creation.
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
      hiuid,
      displayName,
      category,
      bio,
      avatarUrl,
    } = body;

    // Validate required fields
    if (!mintAddress || !walletAddress || !hiuid || !displayName || !category) {
      return NextResponse.json(
        { error: "Missing required fields: mintAddress, walletAddress, hiuid, displayName, category" },
        { status: 400 }
      );
    }

    // Verify that the HIUID exists and has no token yet
    const { data: identity } = await supabase
      .from("verified_identities")
      .select("has_token")
      .eq("hiuid", hiuid)
      .eq("wallet_address", walletAddress)
      .single();

    if (!identity) {
      return NextResponse.json(
        { error: "Identity not verified. Complete KYC first." },
        { status: 403 }
      );
    }

    if (identity.has_token) {
      return NextResponse.json(
        { error: "This identity already has a token." },
        { status: 409 }
      );
    }

    // Calculate token lock date (1 year from now)
    const lockUntil = new Date();
    lockUntil.setFullYear(lockUntil.getFullYear() + 1);

    // Insert creator token record
    const { data, error } = await supabase.from("creator_tokens").insert({
      mint_address: mintAddress,
      wallet_address: walletAddress,
      hiuid,
      display_name: displayName,
      category,
      bio: bio || "",
      avatar_url: avatarUrl || null,
      token_lock_until: lockUntil.toISOString(),
    });

    if (error) {
      console.error("Failed to create creator token:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark identity as having a token
    await supabase
      .from("verified_identities")
      .update({ has_token: true })
      .eq("hiuid", hiuid);

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
