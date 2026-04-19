// ========================================
// Humanofi — Drop Content Delivery API
// ========================================
// GET /api/drops/[mint]/[dropId]/content
//
// Returns the decrypted content for a verified purchaser.
// Content is stored encrypted on Supabase Storage.
//
// Security:
//   - Must be authenticated
//   - Must have a verified purchase in drop_purchases
//   - OR must be the creator
//   - Content is decrypted server-side and streamed

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";
import crypto from "crypto";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string; dropId: string }> }
) {
  const { mint, dropId } = await params;
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Auth required
  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress) {
    return NextResponse.json(
      { error: auth.error || "Authentication required" },
      { status: 401 }
    );
  }

  try {
    // Fetch the drop (including sensitive fields)
    const { data: drop } = await supabase
      .from("exclusive_drops")
      .select("id, creator_mint, creator_wallet, content_path, encrypt_key, title, content_type")
      .eq("id", dropId)
      .eq("creator_mint", mint)
      .single();

    if (!drop) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }

    // Check access: must be creator OR verified purchaser
    const isCreator = drop.creator_wallet === auth.walletAddress;

    if (!isCreator) {
      const { data: purchase } = await supabase
        .from("drop_purchases")
        .select("id")
        .eq("drop_id", dropId)
        .eq("buyer_wallet", auth.walletAddress)
        .eq("verified", true)
        .single();

      if (!purchase) {
        return NextResponse.json(
          { error: "You must purchase this drop to access the content" },
          { status: 403 }
        );
      }
    }

    // Download encrypted file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("drops")
      .download(drop.content_path);

    if (downloadError || !fileData) {
      console.error("[Drops] Storage download error:", downloadError);
      return NextResponse.json(
        { error: "Content not available — please contact the creator" },
        { status: 500 }
      );
    }

    // Decrypt the content
    const encryptedBuffer = Buffer.from(await fileData.arrayBuffer());

    // AES-256-CBC: first 16 bytes = IV, rest = encrypted data
    const iv = encryptedBuffer.subarray(0, 16);
    const encrypted = encryptedBuffer.subarray(16);
    const key = Buffer.from(drop.encrypt_key, "hex");

    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    // Determine content type for response
    const contentTypeMap: Record<string, string> = {
      document: "application/pdf",
      video: "video/mp4",
      audio: "audio/mpeg",
      image: "image/jpeg",
      archive: "application/zip",
      other: "application/octet-stream",
    };

    const mimeType = contentTypeMap[drop.content_type] || "application/octet-stream";
    const filename = `${drop.title.replace(/[^a-zA-Z0-9]/g, "_")}.${getExtension(drop.content_type)}`;

    return new NextResponse(decrypted, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(decrypted.length),
        "Cache-Control": "private, no-cache, no-store",
      },
    });
  } catch (error) {
    console.error("[Drops] Content delivery error:", error);
    return NextResponse.json({ error: "Failed to deliver content" }, { status: 500 });
  }
}

function getExtension(contentType: string): string {
  const map: Record<string, string> = {
    document: "pdf",
    video: "mp4",
    audio: "mp3",
    image: "jpg",
    archive: "zip",
    other: "bin",
  };
  return map[contentType] || "bin";
}
