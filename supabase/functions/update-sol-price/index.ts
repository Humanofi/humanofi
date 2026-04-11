// ========================================
// Humanofi — SOL/USD Price Oracle (Edge Function)
// ========================================
//
// Fetches the latest SOL/USD price from Pyth Hermes
// and upserts it into the oracle_prices table.
//
// Called every 10 seconds by pg_cron.
// Uses Pyth Hermes REST API — no API key needed, no rate limits
// on Triton's hosted instance.
//
// Pyth SOL/USD Price Feed ID (mainnet):
// 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SOL_USD_FEED_ID =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

// Pyth Hermes endpoints — ordered by priority
// 1. Triton (production, no rate limit)
// 2. Pyth public (fallback, rate limited)
const HERMES_ENDPOINTS = [
  "https://hermes.pyth.network",
  "https://hermes-beta.pyth.network",
];

interface PythPriceResponse {
  parsed: Array<{
    id: string;
    price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
    ema_price: {
      price: string;
      conf: string;
      expo: number;
      publish_time: number;
    };
  }>;
}

async function fetchPythPrice(): Promise<{
  price_usd: number;
  confidence: number;
  expo: number;
} | null> {
  for (const endpoint of HERMES_ENDPOINTS) {
    try {
      const url = `${endpoint}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}&parsed=true`;

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!res.ok) {
        console.warn(`Hermes ${endpoint} returned ${res.status}`);
        continue;
      }

      const data: PythPriceResponse = await res.json();

      if (!data.parsed || data.parsed.length === 0) {
        console.warn(`Hermes ${endpoint} returned empty parsed data`);
        continue;
      }

      const feed = data.parsed[0];
      const rawPrice = parseInt(feed.price.price, 10);
      const rawConf = parseInt(feed.price.conf, 10);
      const expo = feed.price.expo;

      // Convert to human-readable USD price
      // price = rawPrice * 10^expo
      const price_usd = rawPrice * Math.pow(10, expo);
      const confidence = rawConf * Math.pow(10, expo);

      // Sanity check — SOL should be between $1 and $10,000
      if (price_usd < 1 || price_usd > 10_000) {
        console.warn(
          `Suspicious SOL price: $${price_usd} — skipping update`,
        );
        continue;
      }

      return { price_usd, confidence, expo };
    } catch (err) {
      console.warn(`Hermes ${endpoint} error:`, err);
      continue;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    // Verify authorization (only service_role or cron should call this)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      });
    }

    // Fetch price from Pyth
    const priceData = await fetchPythPrice();

    if (!priceData) {
      console.error("All Pyth Hermes endpoints failed");
      return new Response(
        JSON.stringify({ error: "All price sources failed" }),
        { status: 502 },
      );
    }

    // Update Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
      .from("oracle_prices")
      .upsert(
        {
          id: "SOL_USD",
          price_usd: priceData.price_usd,
          confidence: priceData.confidence,
          expo: priceData.expo,
          source: "pyth_hermes",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (error) {
      console.error("Supabase upsert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        price_usd: priceData.price_usd,
        confidence: priceData.confidence,
        updated_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500 },
    );
  }
});
