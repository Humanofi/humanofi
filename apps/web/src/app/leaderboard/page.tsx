"use client";

import { useState, useEffect, useCallback } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { getAllPersons } from "@/lib/data";
import type { Person } from "@/lib/mockData";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useSolPrice } from "@/hooks/useSolPrice";
import { PublicKey } from "@solana/web3.js";

export default function LeaderboardPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { fetchBondingCurve } = useHumanofi();
  const { priceUsd: solPriceUsd } = useSolPrice();

  // ── Enrichment: same logic as homepage ──
  const enrichPrices = useCallback(async (data: Person[]) => {
    if (data.length === 0 || !fetchBondingCurve) return data;

    const { supabase: sb } = await import("@/lib/supabase/client");

    const enriched = await Promise.all(
      data.map(async (p) => {
        try {
          const isMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.id);
          if (!isMint) return p;

          const curve = await fetchBondingCurve(new PublicKey(p.id));
          if (!curve) return p;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c = curve as any;
          // Handle both snake_case and camelCase from Anchor
          const x = Number((c.x ?? c.x)?.toString() || "0");
          const y = Number((c.y ?? c.y)?.toString() || "0");
          const supplyCreator = Number((c.supply_creator ?? c.supplyCreator)?.toString() || "0");

          if (y === 0) return p;

          // Spot price: lamports per base unit → SOL per whole token
          const spotLamports = x / y;
          const priceSolPerToken = (spotLamports / 1e9) * 1e6;
          const priceUsd = priceSolPerToken * solPriceUsd;

          // SOL Reserve = real capital backing the token
          const solReserveLamports = Number((c.sol_reserve ?? c.solReserve)?.toString() || "0");
          const backedSol = solReserveLamports / 1e9;
          const backedUsd = backedSol * solPriceUsd;

          // ── Get real holder count + price change from trades ──
          let holderCount = p.holders;
          let priceChange = 0;

          if (sb) {
            const { data: trades } = await sb
              .from("trades")
              .select("wallet_address, trade_type, price_sol")
              .eq("mint_address", p.id)
              .order("created_at", { ascending: true });

            if (trades && trades.length > 0) {
              const buyWallets = new Set(
                trades.filter(t => t.trade_type === "buy").map(t => t.wallet_address)
              );
              holderCount = buyWallets.size;

              const firstPrice = Number(trades[0].price_sol);
              const lastPrice = Number(trades[trades.length - 1].price_sol);
              if (firstPrice > 0) {
                priceChange = parseFloat(((lastPrice - firstPrice) / firstPrice * 100).toFixed(1));
              }
            }
          }

          // Creator always holds via founder buy
          if (holderCount === 0 && supplyCreator > 0) holderCount = 1;

          return {
            ...p,
            price: priceUsd >= 0.01
              ? `$${priceUsd.toFixed(2)}`
              : priceUsd >= 0.0001
                ? `$${priceUsd.toFixed(4)}`
                : `$${priceUsd.toFixed(6)}`,
            priceNum: priceUsd,
            change: priceChange,
            holders: holderCount,
            marketCap: backedSol >= 1
              ? `${backedSol.toFixed(2)} SOL ($${backedUsd.toFixed(0)})`
              : `${backedSol.toFixed(4)} SOL ($${backedUsd.toFixed(2)})`,
            activityScore: p.activityScore || 0,
          };
        } catch {
          return p;
        }
      })
    );

    return enriched;
  }, [fetchBondingCurve, solPriceUsd]);

  useEffect(() => {
    let cancelled = false;
    getAllPersons().then(async (data) => {
      if (cancelled) return;
      setPeople(data);
      setLoading(false);

      // Enrich with on-chain + trades data
      const enriched = await enrichPrices(data);
      if (!cancelled) setPeople(enriched);
    });
    return () => { cancelled = true; };
  }, [enrichPrices]);

  // Sort by holders desc, then by activityScore
  const sorted = [...people].sort((a, b) => {
    if (b.holders !== a.holders) return b.holders - a.holders;
    return (b.activityScore || 0) - (a.activityScore || 0);
  });

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />
      <main className="page page--no-hero">
        <div className="page__header" style={{ display: "block" }}>
          <h1 className="page__title">Leaderboard</h1>
          <p className="page__subtitle">
            The people the world believes in — ranked by real trust, with real capital.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, fontWeight: 800, color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : (
          <div className="lb-list">
            <div className="lb-header">
              <div>#</div>
              <div>Person</div>
              <div>Price</div>
              <div>Holders</div>
              <div>Backed</div>
              <div>Trend</div>
              <div>Score</div>
            </div>
            
            {sorted.map((person, i) => {
              let topClass = "";
              if (i === 0) topClass = "lb-card--top1";
              else if (i === 1) topClass = "lb-card--top2";
              else if (i === 2) topClass = "lb-card--top3";

              return (
                <div 
                  key={person.id} 
                  className={`lb-card ${topClass}`}
                  onClick={() => router.push(`/person/${person.id}`)}
                >
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: topClass ? "inherit" : "var(--text-faint)" }}>
                    {i + 1}
                  </div>
                  <div className="table__person">
                    <Image
                      src={person.photoUrl}
                      alt={person.name}
                      width={48}
                      height={48}
                      className="table__avatar"
                    />
                    <div>
                      <div className="table__name">{person.name}</div>
                      <div className="table__tag">{person.tag}</div>
                    </div>
                  </div>
                  <div className="table__value table__value--accent">
                    {person.price}
                  </div>
                  <div className="table__value">
                    {person.holders.toLocaleString("en-US")}
                  </div>
                  <div className="table__value">{person.marketCap}</div>
                  <div>
                    <span
                      style={{
                        color: person.change >= 0 ? "var(--up)" : "var(--down)",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                      }}
                    >
                      {person.change >= 0 ? "+" : ""}
                      {person.change}%
                    </span>
                  </div>
                  <div>
                    <div className="table__score">
                      <div
                        className="table__score-bar"
                        style={{ width: `${Math.min(person.activityScore, 40)}px` }}
                      />
                      <span className="table__score-text">
                        {person.activityScore}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
