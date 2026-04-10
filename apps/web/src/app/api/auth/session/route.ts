// ========================================
// Humanofi — Auth Session Sync
// ========================================
// POST /api/auth/session
//
// Called after Privy login to sync the user with Supabase.
// 1. Verifies the Privy access token
// 2. Creates or retrieves the Supabase user (via admin API)
// 3. Signs a custom JWT that Supabase accepts
// 4. Returns the JWT + user profile for client-side usage

import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { createServerClient } from "@/lib/supabase/client";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

/**
 * Verify a Privy access token server-side.
 * Returns the decoded user data if valid.
 */
async function verifyPrivyToken(
  accessToken: string
): Promise<{ userId: string; walletAddress?: string } | null> {
  try {
    // Privy token verification via their API
    const response = await fetch("https://auth.privy.io/api/v1/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "privy-app-id": PRIVY_APP_ID || "",
      },
    });

    if (!response.ok) return null;

    const userData = await response.json();

    // Extract wallet address from linked accounts
    const solanaWallet = userData.linked_accounts?.find(
      (acc: { type: string; chain_type?: string }) =>
        acc.type === "wallet" && acc.chain_type === "solana"
    );

    return {
      userId: userData.id,
      walletAddress: solanaWallet?.address || userData.wallet?.address,
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!SUPABASE_JWT_SECRET) {
    return NextResponse.json(
      { error: "SUPABASE_JWT_SECRET not configured" },
      { status: 503 }
    );
  }

  try {
    const { accessToken, walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      );
    }

    // If Privy is configured, verify the access token
    let verifiedUserId: string | null = null;
    if (PRIVY_APP_ID && accessToken) {
      const verified = await verifyPrivyToken(accessToken);
      if (!verified) {
        return NextResponse.json(
          { error: "Invalid Privy token" },
          { status: 401 }
        );
      }
      verifiedUserId = verified.userId;
    }

    // Upsert user profile in Supabase
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 }
      );
    }

    // Create or update the profile
    const { data: profile, error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          wallet_address: walletAddress,
          privy_user_id: verifiedUserId,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "wallet_address" }
      )
      .select()
      .single();

    if (upsertError) {
      console.error("[Auth] Profile upsert error:", upsertError);
      // Don't fail — profile is nice to have, not critical
    }

    // Check if this wallet has a verified identity (KYC done)
    const { data: identity } = await supabase
      .from("verified_identities")
      .select("hiuid, has_token, country_code")
      .eq("wallet_address", walletAddress)
      .single();

    // Check if this wallet is a creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("mint_address, display_name, category")
      .eq("wallet_address", walletAddress)
      .single();

    // Sign a Supabase-compatible JWT
    // This JWT lets the frontend call Supabase with auth context
    const supabaseToken = jwt.sign(
      {
        // Standard JWT claims
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
        iat: Math.floor(Date.now() / 1000),
        iss: "supabase",
        sub: walletAddress, // The user ID = wallet address
        role: "authenticated",
        // Custom claims for Humanofi
        wallet_address: walletAddress,
        is_verified: !!identity,
        is_creator: !!creator,
      },
      SUPABASE_JWT_SECRET
    );

    return NextResponse.json({
      success: true,
      supabaseToken,
      user: {
        walletAddress,
        privyUserId: verifiedUserId,
        isVerified: !!identity,
        isCreator: !!creator,
        hiuid: identity?.hiuid || null,
        hasToken: identity?.has_token || false,
        countryCode: identity?.country_code || null,
        creator: creator || null,
        profile: profile || null,
      },
    });
  } catch (error) {
    console.error("[Auth] Session sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync session" },
      { status: 500 }
    );
  }
}
