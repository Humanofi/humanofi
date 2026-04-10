import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// DELETE: Creator can delete their own public post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  try {
    // Verify ownership
    const { data: creator } = await supabase
      .from("creator_tokens")
      .select("mint_address")
      .eq("wallet_address", auth.walletAddress)
      .single();

    if (!creator) return NextResponse.json({ error: "Not a creator" }, { status: 403 });

    const { error } = await supabase
      .from("public_posts")
      .delete()
      .eq("id", postId)
      .eq("creator_mint", creator.mint_address);

    if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete public post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
