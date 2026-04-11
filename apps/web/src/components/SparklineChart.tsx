// ========================================
// Humanofi — SparklineChart (Mini Chart for Cards)
// ========================================
// Fetches real price history from Supabase for card sparklines.
// Shows flat line if no real data available.

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

interface SparklineChartProps {
  mintAddress?: string;
  change: number;
  width?: number;
  height?: number;
}

export default function SparklineChart({
  mintAddress,
  change,
  width = 100,
  height = 30,
}: SparklineChartProps) {
  const [points, setPoints] = useState<number[]>([10, 10, 10, 10, 10]);
  const [realChange, setRealChange] = useState<number>(change);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (!mintAddress || !supabase) return;

    const fetchData = async () => {
      const sb = supabase;
      if (!sb) return;

      try {
        const { data, error } = await sb
          .from("price_snapshots")
          .select("price_sol")
          .eq("mint_address", mintAddress)
          .order("created_at", { ascending: true })
          .limit(20);

        if (!error && data && data.length >= 2) {
          const prices = data.map((d) => d.price_sol);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          const range = max - min || 1;
          const normalized = prices.map((p) => ((p - min) / range) * 18 + 1);
          setPoints(normalized);
          setHasData(true);

          const first = prices[0];
          const last = prices[prices.length - 1];
          if (first > 0) {
            setRealChange(parseFloat(((last - first) / first * 100).toFixed(1)));
          }
        }
      } catch {
        // Keep flat line
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

  const strokeColor = hasData
    ? (realChange >= 0 ? "var(--up)" : "var(--down)")
    : "rgba(150, 150, 150, 0.3)";

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
