// ========================================
// Humanofi — Didit Webhook Handler
// ========================================
// POST /api/identity/didit-webhook
//
// Receives real-time updates from Didit when verification
// status changes (Approved, Declined, In Review, Abandoned).
// Uses X-Signature-V2 HMAC verification (recommended by Didit).
// Docs: https://docs.didit.me/integration/webhooks

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createServerClient } from "@/lib/supabase/client";

const DIDIT_WEBHOOK_SECRET = process.env.DIDIT_WEBHOOK_SECRET;

// ─── Didit Signature Verification ───

/**
 * Process floats to match Didit's server-side behavior.
 * Converts float values that are whole numbers to integers.
 */
function shortenFloats(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(shortenFloats);
  } else if (data !== null && typeof data === "object") {
    return Object.fromEntries(
      Object.entries(data as Record<string, unknown>).map(([key, value]) => [key, shortenFloats(value)])
    );
  } else if (typeof data === "number" && !Number.isInteger(data) && data % 1 === 0) {
    return Math.trunc(data);
  }
  return data;
}

/**
 * Sort object keys recursively for canonical JSON encoding.
 */
function sortKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  } else if (obj !== null && typeof obj === "object") {
    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce((result: Record<string, unknown>, key: string) => {
        result[key] = sortKeys((obj as Record<string, unknown>)[key]);
        return result;
      }, {});
  }
  return obj;
}

/**
 * Verify X-Signature-V2 (Recommended by Didit).
 * Works even if middleware re-encodes special characters.
 */
function verifySignatureV2(
  jsonBody: Record<string, unknown>,
  signatureHeader: string,
  timestampHeader: string,
  secretKey: string
): boolean {
  // Check timestamp freshness (within 5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  const incomingTime = parseInt(timestampHeader, 10);
  if (Math.abs(currentTime - incomingTime) > 300) {
    return false;
  }

  // Process floats and create sorted JSON with unescaped Unicode
  const processedData = shortenFloats(jsonBody);
  const canonicalJson = JSON.stringify(sortKeys(processedData));

  const hmac = createHmac("sha256", secretKey);
  const expectedSignature = hmac.update(canonicalJson, "utf8").digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signatureHeader, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Verify X-Signature-Simple (Fallback).
 * Independent of JSON encoding - verifies core fields only.
 */
function verifySignatureSimple(
  jsonBody: Record<string, unknown>,
  signatureHeader: string,
  timestampHeader: string,
  secretKey: string
): boolean {
  const currentTime = Math.floor(Date.now() / 1000);
  const incomingTime = parseInt(timestampHeader, 10);
  if (Math.abs(currentTime - incomingTime) > 300) {
    return false;
  }

  const canonicalString = [
    jsonBody.timestamp || "",
    jsonBody.session_id || "",
    jsonBody.status || "",
    jsonBody.webhook_type || "",
  ].join(":");

  const hmac = createHmac("sha256", secretKey);
  const expectedSignature = hmac.update(canonicalString as string).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signatureHeader, "utf8")
    );
  } catch {
    return false;
  }
}

// ─── Route Handler ───

export async function POST(request: NextRequest) {
  if (!DIDIT_WEBHOOK_SECRET) {
    console.error("[Didit Webhook] DIDIT_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const signatureV2 = request.headers.get("x-signature-v2");
    const signatureSimple = request.headers.get("x-signature-simple");
    const timestamp = request.headers.get("x-timestamp");

    if (!timestamp) {
      return NextResponse.json({ error: "Missing timestamp" }, { status: 401 });
    }

    // Verify signature (V2 first, then Simple fallback)
    let verified = false;

    if (signatureV2 && verifySignatureV2(body, signatureV2, timestamp, DIDIT_WEBHOOK_SECRET)) {
      verified = true;
    } else if (signatureSimple && verifySignatureSimple(body, signatureSimple, timestamp, DIDIT_WEBHOOK_SECRET)) {
      verified = true;
    }

    if (!verified) {
      console.error("[Didit Webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Extract webhook data
    const {
      session_id,
      status,
      vendor_data, // This is the wallet address we passed
      webhook_type,
    } = body;

    console.log(`[Didit Webhook] ${webhook_type}: session=${session_id}, status=${status}, wallet=${vendor_data}`);

    // Handle status updates
    if (webhook_type === "status.updated") {
      const supabase = createServerClient();

      if (supabase && vendor_data) {
        switch (status) {
          case "Approved":
            console.log(`[Didit] ✅ Identity APPROVED for wallet: ${vendor_data}`);
            // The actual HIUID generation happens when the user calls /api/identity/verify
            // This webhook just logs for monitoring
            break;

          case "Declined":
            console.log(`[Didit] ❌ Identity DECLINED for wallet: ${vendor_data}`);
            break;

          case "In Review":
            console.log(`[Didit] ⏳ Identity IN REVIEW for wallet: ${vendor_data}`);
            break;

          case "Abandoned":
            console.log(`[Didit] 🚫 Identity ABANDONED for wallet: ${vendor_data}`);
            break;

          default:
            console.log(`[Didit] Unknown status: ${status}`);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Didit Webhook] Error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
