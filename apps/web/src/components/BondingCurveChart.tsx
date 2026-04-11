// ========================================
// Humanofi — Bonding Curve Chart (TradingView Lightweight Charts)
// ========================================
// Professional-grade financial chart for token price history.
// Reads real price snapshots from Supabase.
// Shows flat line at current price when no history exists.

"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries, type IChartApi, ColorType } from "lightweight-charts";
import { supabase } from "@/lib/supabase/client";

interface PricePoint {
  time: string;
  value: number;
}

interface BondingCurveChartProps {
  mintAddress?: string;
  currentPrice: number;
  change: number;
  sparkline?: number[];
  height?: number;
}

/**
 * Generate a flat line at the current price (honest: no fake movement).
 */
function generateFlatLine(currentPrice: number): PricePoint[] {
  const points: PricePoint[] = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    points.push({
      time: date.toISOString().split("T")[0],
      value: currentPrice || 0.0001,
    });
  }
  return points;
}

/**
 * Fetch real price history from Supabase.
 */
async function fetchPriceHistory(mintAddress: string): Promise<PricePoint[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("price_snapshots")
      .select("price_sol, created_at")
      .eq("mint_address", mintAddress)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error || !data || data.length === 0) return [];

    // Deduplicate by day (keep last price per day)
    const byDay = new Map<string, number>();
    for (const row of data) {
      const day = new Date(row.created_at).toISOString().split("T")[0];
      byDay.set(day, row.price_sol);
    }

    return Array.from(byDay.entries()).map(([day, price]) => ({
      time: day,
      value: parseFloat(Number(price).toFixed(6)),
    }));
  } catch {
    return [];
  }
}

function calcChange(data: PricePoint[]): number {
  if (data.length < 2) return 0;
  const first = data[0].value;
  const last = data[data.length - 1].value;
  if (first === 0) return 0;
  return parseFloat(((last - first) / first * 100).toFixed(1));
}

export default function BondingCurveChart({
  mintAddress,
  currentPrice,
  change,
  height = 220,
}: BondingCurveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [displayChange, setDisplayChange] = useState<number>(change);
  const [hasRealData, setHasRealData] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const buildChart = async () => {
      // Fetch data first (async), before touching DOM
      let data: PricePoint[];
      let computedChange = change;
      let isReal = false;

      if (mintAddress) {
        const realData = await fetchPriceHistory(mintAddress);
        if (realData.length >= 2) {
          data = realData;
          computedChange = calcChange(realData);
          isReal = true;
        } else {
          data = generateFlatLine(currentPrice);
        }
      } else {
        data = generateFlatLine(currentPrice);
      }

      // Check if component is still mounted and ref is ready
      if (cancelled || !chartContainerRef.current) return;

      // Clear previous chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      // Double-check ref after cleanup
      if (!chartContainerRef.current) return;

      setDisplayChange(computedChange);
      setHasRealData(isReal);

      const isPositive = computedChange >= 0;
      const lineColor = isPositive ? "#22c55e" : "#ef4444";
      const topColor = isPositive ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.2)";
      const bottomColor = isPositive ? "rgba(34, 197, 94, 0.02)" : "rgba(239, 68, 68, 0.02)";

      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#999",
          fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(0, 0, 0, 0.04)" },
          horzLines: { color: "rgba(0, 0, 0, 0.04)" },
        },
        crosshair: {
          vertLine: {
            color: "#1144ff",
            width: 1,
            style: 2,
            labelBackgroundColor: "#1144ff",
          },
          horzLine: {
            color: "#1144ff",
            width: 1,
            style: 2,
            labelBackgroundColor: "#1144ff",
          },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderVisible: false,
          timeVisible: false,
          fixLeftEdge: true,
          fixRightEdge: true,
        },
        handleScale: false,
        handleScroll: false,
      });

      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: isReal ? lineColor : "rgba(100, 100, 100, 0.4)",
        topColor: isReal ? topColor : "rgba(100, 100, 100, 0.05)",
        bottomColor: isReal ? bottomColor : "rgba(100, 100, 100, 0.01)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: isReal ? lineColor : "#666",
      });

      areaSeries.setData(data as { time: string; value: number }[]);
      chart.timeScale().fitContent();

      chartRef.current = chart;
      setIsReady(true);
    };

    buildChart();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [mintAddress, currentPrice, change, height]);

  return (
    <div className="profile-chart-container">
      <div className="profile-chart-header">
        <div>
          <div style={{ fontSize: "0.75rem", fontWeight: 800, textTransform: "uppercase", color: "var(--text-faint)" }}>
            Bonding Curve
          </div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>
            {currentPrice.toFixed(4)} SOL
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{
            color: displayChange >= 0 ? "var(--up)" : "var(--down)",
            fontWeight: 800,
            fontSize: "1rem",
          }}>
            {displayChange >= 0 ? "+" : ""}{displayChange}%
          </div>
          {!hasRealData && (
            <div style={{
              fontSize: "0.6rem",
              color: "var(--text-faint)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              No trades yet
            </div>
          )}
        </div>
      </div>
      <div
        ref={chartContainerRef}
        style={{
          width: "100%",
          height,
          opacity: isReady ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
    </div>
  );
}
