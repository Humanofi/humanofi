import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// DELETE /api/inner-circle/[mint]/posts/[postId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string; postId: string }> }
) {
  const { mint, postId } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    // Verify the user is the creator of this mint
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("wallet_address")
      .eq("mint_address", mint)
      .single();

    if (!creator || creator.wallet_address !== auth.walletAddress) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete the post
    const { error } = await supabase
      .from("inner_circle_posts")
      .delete()
      .eq("id", postId)
      .eq("creator_mint", mint);

    if (error) {
      return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
