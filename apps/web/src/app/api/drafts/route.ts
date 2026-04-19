import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/drafts?wallet=xxx — Load draft for a wallet
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const { data, error } = await supabase
    .from("creator_drafts")
    .select("*")
    .eq("wallet_address", wallet)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draft: data });
}

// POST /api/drafts — Save/update draft (upsert)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, ...fields } = body;

    if (!walletAddress) {
      return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
    }

    const row = {
      wallet_address: walletAddress,
      token_name: fields.tokenName || "",
      token_symbol: fields.tokenSymbol || "",
      category: fields.category || "",
      bio: fields.bio || "",
      story: fields.story || "",
      offer: fields.offer || "",
      country: fields.country || "",
      twitter: fields.twitter || "",
      linkedin: fields.linkedin || "",
      website: fields.website || "",
      instagram: fields.instagram || "",
      initial_liquidity_usd: fields.initialLiquidityUSD || 20,
      current_section: fields.currentSection || 0,
    };

    const { error } = await supabase
      .from("creator_drafts")
      .upsert(row, { onConflict: "wallet_address" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

// DELETE /api/drafts?wallet=xxx — Delete draft after successful launch
export async function DELETE(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const { error } = await supabase
    .from("creator_drafts")
    .delete()
    .eq("wallet_address", wallet);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
