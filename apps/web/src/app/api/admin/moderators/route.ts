// ========================================
// Humanofi — Admin Moderators API
// ========================================
// GET    /api/admin/moderators — List wallets (authority only)
// POST   /api/admin/moderators — Add moderator (authority only)
// DELETE /api/admin/moderators?wallet=xxx — Revoke (authority only)

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { verifyAdmin, isAuthority, adminSupabase, logAction } from "../middleware";

const BCRYPT_ROUNDS = 12;

// GET — List all admin wallets
export async function GET(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isAuthority(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await adminSupabase
    .from("admin_wallets")
    .select("wallet_address, role, label, is_active, last_login_at, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wallets: data });
}

// POST — Add a moderator
export async function POST(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isAuthority(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { wallet, password, label, role } = await req.json();
  if (!wallet || !password) {
    return NextResponse.json({ error: "wallet and password required" }, { status: 400 });
  }

  // Only authority can add moderators (not more authorities)
  const safeRole = role === "recovery" ? "recovery" : "moderator";

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { error } = await adminSupabase.from("admin_wallets").insert({
    wallet_address: wallet,
    role: safeRole,
    password_hash: passwordHash,
    label: label || "",
    added_by: session.wallet,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Wallet already registered" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAction(session.wallet, "add_moderator", "wallet", wallet, `Added ${safeRole}: ${label || wallet}`, { role: safeRole }, req);

  return NextResponse.json({ ok: true });
}

// DELETE — Revoke a moderator
export async function DELETE(req: NextRequest) {
  const session = await verifyAdmin(req);
  if (!session || !isAuthority(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  // Cannot revoke yourself
  if (wallet === session.wallet) {
    return NextResponse.json({ error: "Cannot revoke yourself" }, { status: 400 });
  }

  const { error } = await adminSupabase
    .from("admin_wallets")
    .update({ is_active: false })
    .eq("wallet_address", wallet);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAction(session.wallet, "remove_moderator", "wallet", wallet, "Moderator revoked", {}, req);

  return NextResponse.json({ ok: true });
}
