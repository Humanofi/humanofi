// ========================================
// Humanofi — Bonding Curve Chart (TradingView Lightweight Charts)
// ========================================
// Professional-grade financial chart for token price history.
// Reads real price snapshots from Supabase, falls back to mock data.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, AreaSeries, type IChartApi, ColorType } from "lightweight-charts";
import { supabase } from "@/lib/supabase/client";

interface PricePoint {
  time: string;
  value: number;
}

interface BondingCurveChartProps {
  /** Mint address of the token (for real data) */
  mintAddress?: string;
  /** Current token price in SOL */
  currentPrice: number;
  /** Price change percentage */
  change: number;
  /** Mock sparkline data (used when no real data available) */
  sparkline?: number[];
  /** Chart height in pixels */
  height?: number;
}

/**
 * Generate mock area chart data from a sparkline array.
 */
function generateMockData(sparkline: number[], currentPrice: number): PricePoint[] {
  const now = new Date();
  const basePrice = currentPrice * 0.7;
  const range = currentPrice - basePrice;

  return sparkline.map((val, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (sparkline.length - i));
    const normalizedVal = val / 20;
    const price = basePrice + range * normalizedVal;
    return {
      time: date.toISOString().split("T")[0],
      value: parseFloat(price.toFixed(6)),
    };
  });
}

/**
 * Fetch real price history from Supabase.
 */
async function fetchPriceHistory(mintAddress: string): Promise<PricePoint[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("price_snapshots")
    .select("price_sol, created_at")
    .eq("mint_address", mintAddress)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error || !data || data.length === 0) return [];

  // Deduplicate by day (keep last price per day for daily chart)
  const byDay = new Map<string, number>();
  for (const row of data) {
    const day = new Date(row.created_at).toISOString().split("T")[0];
    byDay.set(day, row.price_sol);
  }

  return Array.from(byDay.entries()).map(([day, price]) => ({
    time: day,
    value: parseFloat(price.toFixed(6)),
  }));
}

/**
 * Calculate percentage change from price history data.
 */
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
  sparkline = [],
  height = 220,
}: BondingCurveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [realChange, setRealChange] = useState<number>(change);

  const buildChart = useCallback(async () => {
    if (!chartContainerRef.current) return;

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    // Try to load real data
    let data: PricePoint[];
    let displayChange = change;

    if (mintAddress) {
      const realData = await fetchPriceHistory(mintAddress);
      if (realData.length >= 2) {
        data = realData;
        displayChange = calcChange(realData);
      } else {
        // Not enough real data — use mock with current price
        data = generateMockData(
          sparkline.length > 0 ? sparkline : Array.from({ length: 30 }, () => Math.floor(Math.random() * 18) + 3),
          currentPrice
        );
      }
    } else {
      data = generateMockData(
        sparkline.length > 0 ? sparkline : Array.from({ length: 30 }, () => Math.floor(Math.random() * 18) + 3),
        currentPrice
      );
    }

    setRealChange(displayChange);

    const isPositive = displayChange >= 0;
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
      lineColor,
      topColor,
      bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: lineColor,
    });

    areaSeries.setData(data as { time: string; value: number }[]);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    setIsReady(true);
  }, [mintAddress, currentPrice, change, sparkline, height]);

  useEffect(() => {
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
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [buildChart]);

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
        <div style={{
          color: realChange >= 0 ? "var(--up)" : "var(--down)",
          fontWeight: 800,
          fontSize: "1rem",
        }}>
          {realChange >= 0 ? "+" : ""}{realChange}%
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
