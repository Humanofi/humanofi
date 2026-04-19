// ========================================
// Humanofi — Profile API
// ========================================
// GET  /api/profile?wallet=...  → read profile
// PUT  /api/profile             → update own profile (authenticated)

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { generateIdenticon, getDefaultDisplayName } from "@/lib/identicon";

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("wallet_address, display_name, avatar_url, bio, created_at")
    .eq("wallet_address", wallet)
    .single();

  if (error || !profile) {
    // Return default profile
    return NextResponse.json({
      profile: {
        wallet_address: wallet,
        display_name: getDefaultDisplayName(wallet),
        avatar_url: generateIdenticon(wallet),
        bio: "",
        created_at: null,
      },
    });
  }

  return NextResponse.json({
    profile: {
      ...profile,
      display_name: profile.display_name || getDefaultDisplayName(wallet),
      avatar_url: profile.avatar_url || generateIdenticon(wallet),
    },
  });
}

export async function PUT(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { walletAddress, displayName, bio } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
    }

    // Validate display name
    const cleanName = (displayName || "").trim().slice(0, 30);
    if (cleanName.length < 2) {
      return NextResponse.json({ error: "Display name must be at least 2 characters" }, { status: 400 });
    }

    const cleanBio = (bio || "").trim().slice(0, 160);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        display_name: cleanName,
        bio: cleanBio,
      })
      .eq("wallet_address", walletAddress)
      .select()
      .single();

    if (error) {
      console.error("[Profile] Update error:", error);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({
      profile: {
        ...data,
        avatar_url: data.avatar_url || generateIdenticon(walletAddress),
      },
    });
  } catch (error) {
    console.error("[Profile] Error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
