// ========================================
// Humanofi — Creator Profile Update API
// ========================================
// PATCH /api/creators/profile
// Allows creators to update their profile fields.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";

const ALLOWED_COLORS = ["blue", "violet", "emerald", "orange", "crimson", "cyan", "amber", "pink"];
const MAX_SUBTITLE_LENGTH = 80;
const MAX_GALLERY_IMAGES = 6;

function isValidYouTubeUrl(url: string): boolean {
  if (!url) return true; // empty is fine
  return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[\w-]+/.test(url);
}

export async function PATCH(request: NextRequest) {
  try {
    const walletAddress = request.headers.get("x-wallet-address");
    if (!walletAddress) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 401 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    // Verify this wallet owns a creator token
    const { data: creator, error: findError } = await supabase
      .from("creator_tokens")
      .select("mint_address")
      .eq("wallet_address", walletAddress)
      .single();

    if (findError || !creator) {
      return NextResponse.json({ error: "Creator not found for this wallet" }, { status: 403 });
    }

    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};

    // ── Subtitle ──
    if (body.subtitle !== undefined) {
      const sub = String(body.subtitle).trim().slice(0, MAX_SUBTITLE_LENGTH);
      updates.subtitle = sub;
    }

    // ── YouTube URL ──
    if (body.youtube_url !== undefined) {
      const url = String(body.youtube_url).trim();
      if (url && !isValidYouTubeUrl(url)) {
        return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
      }
      updates.youtube_url = url;
    }

    // ── Gallery URLs ──
    if (body.gallery_urls !== undefined) {
      if (!Array.isArray(body.gallery_urls)) {
        return NextResponse.json({ error: "gallery_urls must be an array" }, { status: 400 });
      }
      updates.gallery_urls = body.gallery_urls.slice(0, MAX_GALLERY_IMAGES);
    }

    // ── Token Color ──  
    if (body.token_color !== undefined) {
      if (!ALLOWED_COLORS.includes(body.token_color)) {
        return NextResponse.json({ error: `Invalid color. Allowed: ${ALLOWED_COLORS.join(", ")}` }, { status: 400 });
      }
      updates.token_color = body.token_color;
    }

    // ── Story, Offer, Bio ──
    if (body.story !== undefined) updates.story = String(body.story).trim();
    if (body.offer !== undefined) updates.offer = String(body.offer).trim();
    if (body.bio !== undefined) updates.bio = String(body.bio).trim();

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("creator_tokens")
      .update(updates)
      .eq("mint_address", creator.mint_address);

    if (updateError) {
      console.error("[Profile] Update failed:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: Object.keys(updates) });
  } catch (error) {
    console.error("[Profile] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
