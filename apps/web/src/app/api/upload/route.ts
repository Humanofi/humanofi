// ========================================
// Humanofi — Upload API
// ========================================
// POST /api/upload
//
// Handles avatar upload to Supabase Storage
// and creates token metadata JSON (Metaplex standard).
//
// Flow:
//   1. Receives avatar (File via FormData) + token metadata
//   2. Uploads avatar to Supabase Storage (bucket: avatars)
//   3. Creates metadata JSON (Metaplex token standard)
//   4. Uploads metadata JSON to Supabase Storage (bucket: metadata)
//   5. Returns public URLs for both

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();

    const avatarFile = formData.get("avatar") as File | null;
    const tokenName = formData.get("tokenName") as string;
    const tokenSymbol = formData.get("tokenSymbol") as string;
    const category = formData.get("category") as string;
    const bio = formData.get("bio") as string;
    const story = formData.get("story") as string;
    const offer = formData.get("offer") as string;
    const country = formData.get("country") as string;
    const walletAddress = formData.get("walletAddress") as string;
    const socialsRaw = formData.get("socials") as string;
    const socials = socialsRaw ? JSON.parse(socialsRaw) : {};

    if (!avatarFile || !tokenName || !tokenSymbol || !walletAddress) {
      return NextResponse.json(
        { error: "avatar, tokenName, tokenSymbol, and walletAddress are required" },
        { status: 400 }
      );
    }

    // ── 1. Upload avatar ──

    const mimeType = avatarFile.type;
    if (!mimeType.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid avatar format" }, { status: 400 });
    }

    const extension = mimeType.split("/")[1]; // "png", "jpeg", etc.
    const avatarBuffer = Buffer.from(await avatarFile.arrayBuffer());

    // Check size (max 5MB)
    if (avatarBuffer.length > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Avatar must be under 5MB" }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const safeSymbol = tokenSymbol.toLowerCase().replace(/[^a-z0-9]/g, "");
    const avatarPath = `${safeSymbol}-${timestamp}.${extension}`;

    // Upload to Supabase Storage (bucket: avatars)
    const { error: avatarError } = await supabase.storage
      .from("avatars")
      .upload(avatarPath, avatarBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (avatarError) {
      console.error("[Upload] Avatar upload error:", avatarError);
      return NextResponse.json(
        { error: `Avatar upload failed: ${avatarError.message}` },
        { status: 500 }
      );
    }

    // Get public URL for the avatar
    const { data: avatarUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(avatarPath);

    const avatarUrl = avatarUrlData.publicUrl;

    // ── 2. Create token metadata JSON (Metaplex standard) ──

    const metadata = {
      name: tokenName,
      symbol: tokenSymbol.toUpperCase(),
      description: bio || `${tokenName}'s personal token on the Humanofi protocol.`,
      image: avatarUrl,
      external_url: `https://humanofi.xyz/person/${safeSymbol}`,
      attributes: [
        { trait_type: "Category", value: category || "other" },
        ...(country ? [{ trait_type: "Country", value: country }] : []),
        { trait_type: "Protocol", value: "Humanofi" },
        { trait_type: "Standard", value: "Token-2022" },
      ],
      properties: {
        files: [
          {
            uri: avatarUrl,
            type: mimeType,
          },
        ],
        category: "social",
        creators: [
          {
            address: walletAddress,
            share: 100,
          },
        ],
      },
      // Humanofi-specific extensions
      humanofi: {
        story: story || "",
        offer: offer || "",
        socials: socials || {},
        country: country || "",
        created_at: new Date().toISOString(),
      },
    };

    // Upload metadata JSON to Supabase Storage
    const metadataPath = `${safeSymbol}-${timestamp}.json`;
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));

    const { error: metadataError } = await supabase.storage
      .from("metadata")
      .upload(metadataPath, metadataBuffer, {
        contentType: "application/json",
        upsert: true,
      });

    if (metadataError) {
      console.error("[Upload] Metadata upload error:", metadataError);
      return NextResponse.json(
        { error: `Metadata upload failed: ${metadataError.message}` },
        { status: 500 }
      );
    }

    // Get public URL for metadata
    const { data: metadataUrlData } = supabase.storage
      .from("metadata")
      .getPublicUrl(metadataPath);

    const metadataUrl = metadataUrlData.publicUrl;

    // ── 3. Return URLs ──
    return NextResponse.json({
      success: true,
      avatarUrl,
      metadataUrl,
      metadata,
    });
  } catch (error) {
    console.error("[Upload] Error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
