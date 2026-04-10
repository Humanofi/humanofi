import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// ── GET: Check if creator has already posted publicly today ──
// Returns: { canPost, nextPostAt? }
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase)
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    // Find creator
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("mint_address")
      .eq("wallet_address", auth.walletAddress)
      .single();

    if (!creator)
      return NextResponse.json({ canPost: false, reason: "not_creator" });

    // Check last 24h
    const twentyFourHoursAgo = new Date(Date.now() - 86400000).toISOString();

    const { data: recentPosts } = await supabase
      .from("public_posts")
      .select("created_at")
      .eq("creator_mint", creator.mint_address)
      .gte("created_at", twentyFourHoursAgo)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentPosts && recentPosts.length >= 1) {
      const lastPostedAt = new Date(recentPosts[0].created_at).getTime();
      const nextPostAt = new Date(lastPostedAt + 86400000).toISOString();
      return NextResponse.json({ canPost: false, nextPostAt });
    }

    return NextResponse.json({ canPost: true });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
