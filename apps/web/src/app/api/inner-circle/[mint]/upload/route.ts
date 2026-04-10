import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { verifyRequest } from "@/lib/auth/verifyRequest";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  const { mint } = await params;
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 503 });

  const auth = await verifyRequest(request);
  if (!auth.authenticated || !auth.walletAddress)
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  // Verify the user is the creator
  const { data: creator } = await supabase
    .from("creator_tokens")
    .select("wallet_address")
    .eq("mint_address", mint)
    .eq("wallet_address", auth.walletAddress)
    .single();

  if (!creator) return NextResponse.json({ error: "Only the creator can upload" }, { status: 403 });

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });
    if (files.length > 6) return NextResponse.json({ error: "Max 6 files per post" }, { status: 400 });

    // Validate file sizes and MIME types
    const ALLOWED_TYPES = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
      "video/mp4", "video/webm", "video/quicktime",
      "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg",
      "application/pdf",
    ];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
    const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30MB total

    let totalSize = 0;
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json({ error: `File type not allowed: ${file.type}` }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large: ${file.name} (max 10MB)` }, { status: 400 });
      }
      totalSize += file.size;
    }
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json({ error: "Total upload size exceeds 30MB" }, { status: 400 });
    }

    const urls: string[] = [];

    for (const file of files) {
      const ext = file.name.split(".").pop() || "bin";
      const fileName = `${mint}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error } = await supabase.storage
        .from("inner-circle-media")
        .upload(fileName, file, {
          contentType: file.type,
          upsert: false,
        });

      if (error) {
        console.error("Upload error:", error);
        continue;
      }

      const { data: publicUrl } = supabase.storage
        .from("inner-circle-media")
        .getPublicUrl(fileName);

      if (publicUrl?.publicUrl) {
        urls.push(publicUrl.publicUrl);
      }
    }

    return NextResponse.json({ urls });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}
