// ========================================
// Humanofi — Admin Auth Middleware
// ========================================
// Verifies JWT cookie + checks wallet is still active in DB.
// Used by all /api/admin/* routes.

import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import * as crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const JWT_SECRET = process.env.ADMIN_JWT_SECRET!;

export interface AdminSession {
  wallet: string;
  role: "authority" | "moderator" | "recovery";
}

// ── JWT helpers (HMAC-SHA256, no external lib needed) ──

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, expiresInSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const [header, body, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (signature !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Main verification function ──

export async function verifyAdmin(req: NextRequest): Promise<AdminSession | null> {
  const token = req.cookies.get("admin_token")?.value;
  if (!token) return null;

  const payload = verifyJwt(token);
  if (!payload || !payload.wallet || !payload.role) return null;

  // Re-check wallet is still active in DB
  const { data } = await supabase
    .from("admin_wallets")
    .select("role, is_active, locked_until")
    .eq("wallet_address", payload.wallet)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  if (data.locked_until && new Date(data.locked_until) > new Date()) return null;

  return { wallet: payload.wallet as string, role: data.role };
}

// ── Role check helpers ──

export function isAuthority(session: AdminSession): boolean {
  return session.role === "authority";
}

export function isModeratorOrAbove(session: AdminSession): boolean {
  return session.role === "authority" || session.role === "moderator";
}

export function isRecovery(session: AdminSession): boolean {
  return session.role === "recovery";
}

// ── Audit logging ──

export async function logAction(
  wallet: string,
  actionType: string,
  targetType: string,
  targetId: string | null,
  reason: string,
  metadata: Record<string, unknown>,
  req: NextRequest
) {
  await supabase.from("moderation_actions").insert({
    moderator_wallet: wallet,
    action_type: actionType,
    target_type: targetType,
    target_id: targetId,
    reason,
    metadata,
    ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
    user_agent: req.headers.get("user-agent") || "unknown",
  });
}

export { signJwt, supabase as adminSupabase };
