// ========================================
// Humanofi — Admin Auth API (v2 — Audit-Grade)
// ========================================
// GET    /api/admin/auth?wallet=xxx → generate nonce
// POST   /api/admin/auth → login (wallet + signature + password)
// DELETE /api/admin/auth → logout
//
// Security:
//   - Nonce anti-replay (one-time, 60s expiry)
//   - ed25519 signature verification (Node.js native crypto)
//   - bcrypt password verification (cost=12)
//   - Rate-limiting (5 fails → 15min lockout)
//   - Zero information disclosure on failure
//   - JWT HttpOnly cookie (1h expiry)

import { NextRequest, NextResponse } from "next/server";
import * as crypto from "crypto";
import bcrypt from "bcryptjs";
import { signJwt, adminSupabase, logAction, verifyAdmin } from "../middleware";

// ── Base58 alphabet (Solana standard) ──
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base58 character");
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Leading zeros
  for (const char of str) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

// ── GET — Generate auth nonce ──
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet || wallet.length < 32) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }

  const nonce = crypto.randomBytes(32).toString("hex");

  // Clean up expired nonces (inline, no RPC dependency)
  await adminSupabase
    .from("admin_nonces")
    .delete()
    .lt("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

  // Store fresh nonce
  await adminSupabase.from("admin_nonces").insert({
    nonce,
    wallet_address: wallet,
  });

  return NextResponse.json({ nonce });
}

// ── POST — Login ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const wallet: string = body.wallet || "";
    const signature: string = body.signature || "";
    const message: string = body.message || "";
    const password: string = body.password || "";

    if (!wallet || !signature || !message || !password) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // 1. Check wallet exists + rate-limit
    const { data: adminData } = await adminSupabase
      .from("admin_wallets")
      .select("wallet_address, role, password_hash, is_active, failed_attempts, locked_until")
      .eq("wallet_address", wallet)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminData) {
      // Constant-time delay — don't reveal wallet existence
      await new Promise(r => setTimeout(r, 500));
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // Check lockout
    if (adminData.locked_until && new Date(adminData.locked_until) > new Date()) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // 2. Verify nonce exists and is fresh
    const nonceMatch = message.match(/HUMANOFI_ADMIN:([a-f0-9]{64}):/);
    const nonce = nonceMatch?.[1];

    if (!nonce) {
      await incrementFailedAttempts(wallet);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    const { data: nonceData } = await adminSupabase
      .from("admin_nonces")
      .select("nonce, wallet_address, created_at, used")
      .eq("nonce", nonce)
      .eq("wallet_address", wallet)
      .eq("used", false)
      .maybeSingle();

    if (!nonceData) {
      await incrementFailedAttempts(wallet);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // Nonce expiry: 60 seconds
    const nonceAge = Date.now() - new Date(nonceData.created_at).getTime();
    if (nonceAge > 60_000) {
      await adminSupabase.from("admin_nonces").delete().eq("nonce", nonce);
      await incrementFailedAttempts(wallet);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // Mark nonce as used (one-time)
    await adminSupabase.from("admin_nonces").update({ used: true }).eq("nonce", nonce);

    // 3. Verify ed25519 signature (Node.js native crypto)
    try {
      const messageBytes = Buffer.from(message, "utf-8");
      const signatureBytes = Buffer.from(decodeBase58(signature));
      const publicKeyBytes = Buffer.from(decodeBase58(wallet));

      // Build ed25519 SPKI DER key
      const derPrefix = Buffer.from("302a300506032b6570032100", "hex");
      const keyObject = crypto.createPublicKey({
        key: Buffer.concat([derPrefix, publicKeyBytes]),
        format: "der",
        type: "spki",
      });

      const isValid = crypto.verify(null, messageBytes, keyObject, signatureBytes);
      if (!isValid) {
        await incrementFailedAttempts(wallet);
        await logAction(wallet, "login_failed", "wallet", wallet, "Invalid signature", {}, req);
        return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
      }
    } catch {
      await incrementFailedAttempts(wallet);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // 4. Verify password (bcrypt)
    const passwordMatch = await bcrypt.compare(password, adminData.password_hash);
    if (!passwordMatch) {
      await incrementFailedAttempts(wallet);
      await logAction(wallet, "login_failed", "wallet", wallet, "Wrong password", {}, req);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // ── SUCCESS ──
    await adminSupabase
      .from("admin_wallets")
      .update({
        failed_attempts: 0,
        locked_until: null,
        last_login_at: new Date().toISOString(),
        last_login_ip: req.headers.get("x-forwarded-for") || "unknown",
      })
      .eq("wallet_address", wallet);

    await logAction(wallet, "login", "wallet", wallet, "Successful login", { role: adminData.role }, req);

    const token = signJwt({ wallet, role: adminData.role }, 3600);

    const response = NextResponse.json({ ok: true, role: adminData.role });
    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
}

// ── DELETE — Logout ──
export async function DELETE(req: NextRequest) {
  const session = await verifyAdmin(req);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_token", "", { maxAge: 0, path: "/" });
  if (session) {
    await logAction(session.wallet, "login", "wallet", session.wallet, "Logout", {}, req);
  }
  return response;
}

// ── Helper: increment failed attempts + lock after 5 ──
async function incrementFailedAttempts(wallet: string) {
  const { data } = await adminSupabase
    .from("admin_wallets")
    .select("failed_attempts")
    .eq("wallet_address", wallet)
    .maybeSingle();

  const attempts = (data?.failed_attempts || 0) + 1;
  const update: Record<string, unknown> = { failed_attempts: attempts };

  if (attempts >= 5) {
    update.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    update.failed_attempts = 0;
  }

  await adminSupabase
    .from("admin_wallets")
    .update(update)
    .eq("wallet_address", wallet);
}

export { encodeBase58 };
