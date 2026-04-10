// ========================================
// Humanofi — Inner Circle Reactions API
// ========================================
// POST /api/inner-circle/[mint]/react

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

const VALID_REACTIONS = ["🔥", "💡", "🙏", "🚀", "❤️", "👀"];

/**
 * POST /api/inner-circle/[mint]/react
 * React to an inner circle post (holders + creator).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json({ error: auth.error || "Authentication required" }, { status: 401 });
  }
  const walletAddress = auth.walletAddress;

  // Verify user is holder or creator
  const { data: creator } = await supabase
    .from("creator_tokens")
    .select("wallet_address")
    .eq("mint_address", mint)
    .eq("wallet_address", walletAddress)
    .single();

  const isCreator = !!creator;

  if (!isCreator) {
    const { data: holding } = await supabase
      .from("token_holders")
      .select("balance")
      .eq("wallet_address", walletAddress)
      .eq("mint_address", mint)
      .gt("balance", 0)
      .single();

    if (!holding) {
      return NextResponse.json(
        { error: "You must hold tokens to react" },
        { status: 403 }
      );
    }
  }

  try {
    const { postId, emoji } = await request.json();

    if (!postId || !emoji) {
      return NextResponse.json(
        { error: "postId and emoji are required" },
        { status: 400 }
      );
    }

    if (!VALID_REACTIONS.includes(emoji)) {
      return NextResponse.json(
        { error: `Invalid reaction. Allowed: ${VALID_REACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    // Upsert (toggle reaction)
    const { data: existing } = await supabase
      .from("inner_circle_reactions")
      .select("id")
      .eq("post_id", postId)
      .eq("wallet_address", walletAddress)
      .eq("emoji", emoji)
      .single();

    if (existing) {
      // Remove reaction (toggle off)
      await supabase
        .from("inner_circle_reactions")
        .delete()
        .eq("id", existing.id);

      return NextResponse.json({ success: true, action: "removed" });
    } else {
      // Add reaction
      const { error } = await supabase.from("inner_circle_reactions").insert({
        post_id: postId,
        wallet_address: walletAddress,
        emoji,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, action: "added" });
    }
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Failed to react" }, { status: 500 });
  }
}
