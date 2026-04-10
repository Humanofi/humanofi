import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

// Helper: verify creator ownership
async function verifyCreatorOwnership(
  supabase: ReturnType<typeof createServerClient>,
  mint: string,
  walletAddress: string
) {
  const { data: creator } = await supabase!
    .from("creator_tokens")
    .select("wallet_address")
    .eq("mint_address", mint)
    .single();

  return creator && creator.wallet_address === walletAddress;
}

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
    const isOwner = await verifyCreatorOwnership(supabase, mint, auth.walletAddress);
    if (!isOwner) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Get content before deleting (for public post cascade)
    const { data: icPost } = await supabase
      .from("inner_circle_posts")
      .select("content")
      .eq("id", postId)
      .eq("creator_mint", mint)
      .single();

    const { error } = await supabase
      .from("inner_circle_posts")
      .delete()
      .eq("id", postId)
      .eq("creator_mint", mint);

    if (error) return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });

    // Cascade: also delete matching public post
    if (icPost?.content) {
      await supabase
        .from("public_posts")
        .delete()
        .eq("creator_mint", mint)
        .eq("content", icPost.content);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/inner-circle/[mint]/posts/[postId]
// Supports: { content?: string, is_archived?: boolean }
export async function PATCH(
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
    const isOwner = await verifyCreatorOwnership(supabase, mint, auth.walletAddress);
    if (!isOwner) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Validate allowed fields
    if (typeof body.content === "string") {
      const trimmed = body.content.trim();
      if (trimmed.length === 0) return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
      if (trimmed.length > 2000) return NextResponse.json({ error: "Content too long" }, { status: 400 });
      updates.content = trimmed;
    }

    if (typeof body.is_archived === "boolean") {
      updates.is_archived = body.is_archived;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await supabase
      .from("inner_circle_posts")
      .update(updates)
      .eq("id", postId)
      .eq("creator_mint", mint);

    if (error) {
      console.error("Update post error:", error);
      return NextResponse.json({ error: "Failed to update post" }, { status: 500 });
    }

    // Cascade: if archiving, also delete the matching public post
    if (updates.is_archived === true) {
      // Get the post content to match against public_posts
      const { data: icPost } = await supabase
        .from("inner_circle_posts")
        .select("content")
        .eq("id", postId)
        .single();

      if (icPost?.content) {
        await supabase
          .from("public_posts")
          .delete()
          .eq("creator_mint", mint)
          .eq("content", icPost.content);
      }
    }

    return NextResponse.json({ success: true, updates });
  } catch (error) {
    console.error("PATCH post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
