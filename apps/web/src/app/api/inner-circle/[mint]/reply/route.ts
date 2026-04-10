// ========================================
// Humanofi — Inner Circle Replies API
// ========================================
// POST /api/inner-circle/[mint]/reply

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

/**
 * POST /api/inner-circle/[mint]/reply
 * Reply to an inner circle post (holders + creator).
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
        { error: "You must hold tokens to reply" },
        { status: 403 }
      );
    }
  }

  try {
    const { postId, content } = await request.json();

    if (!postId || !content?.trim()) {
      return NextResponse.json(
        { error: "postId and content are required" },
        { status: 400 }
      );
    }

    const { data: reply, error } = await supabase
      .from("inner_circle_replies")
      .insert({
        post_id: postId,
        wallet_address: walletAddress,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, reply });
  } catch (error) {
    console.error("Reply error:", error);
    return NextResponse.json({ error: "Failed to create reply" }, { status: 500 });
  }
}
