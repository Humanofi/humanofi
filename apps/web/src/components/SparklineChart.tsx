// ========================================
// Humanofi — SparklineChart (Mini Chart for Cards)
// ========================================
// Fetches real price history from Supabase for card sparklines.
// Falls back to prop data if no real data available.

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface SparklineChartProps {
  mintAddress?: string;
  fallbackData: number[];
  change: number;
  width?: number;
  height?: number;
}

export default function SparklineChart({
  mintAddress,
  fallbackData,
  change,
  width = 100,
  height = 30,
}: SparklineChartProps) {
  const [points, setPoints] = useState<number[]>(fallbackData);
  const [realChange, setRealChange] = useState<number>(change);

  useEffect(() => {
    if (!mintAddress || !supabase) return;

    const fetchData = async () => {
      const sb = supabase;
      if (!sb) return;

      const { data, error } = await sb
        .from("price_snapshots")
        .select("price_sol")
        .eq("mint_address", mintAddress)
        .order("created_at", { ascending: true })
        .limit(20);

      if (!error && data && data.length >= 3) {
        const prices = data.map((d) => d.price_sol);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        // Normalize to 0-20 like mock sparkline
        const normalized = prices.map((p) => ((p - min) / range) * 18 + 1);
        setPoints(normalized);

        // Calculate real change
        const first = prices[0];
        const last = prices[prices.length - 1];
        if (first > 0) {
          setRealChange(parseFloat(((last - first) / first * 100).toFixed(1)));
        }
      }
    };

    fetchData();
  }, [mintAddress]);

  // Generate SVG path
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = width / (points.length - 1 || 1);

  const d = points.reduce((acc, val, i) => {
    const x = i * step;
    const y = height - ((val - min) / range) * height;
    return `${acc} ${i === 0 ? "M" : "L"} ${x},${y}`;
  }, "");

  const strokeColor = realChange >= 0 ? "var(--up)" : "var(--down)";

  return (
    <svg width={width} height={height} className="card__sparkline" viewBox={`0 -5 ${width} ${height + 10}`}>
      <path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
