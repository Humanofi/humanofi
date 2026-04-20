// ========================================
// Humanofi — SparklineChart (Mini Chart for Cards)
// ========================================
// Fetches real trade price history from Supabase for card sparklines.
// Uses trades table (price_sol field) as the source of truth.

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
    if (!mintAddress) return;

    const fetchData = async () => {
      if (!supabase) return;

      try {
        const { data, error } = await supabase
          .from("trades")
          .select("price_sol")
          .eq("mint_address", mintAddress)
          .order("created_at", { ascending: true })
          .limit(30);

        if (!error && data && data.length >= 2) {
          const prices = data.map((d) => Number(d.price_sol));
          setPoints(prices);
          setHasData(true);

          const first = prices[0];
          const last = prices[prices.length - 1];
          if (first > 0) {
            setRealChange(parseFloat(((last - first) / first * 100).toFixed(1)));
          }
        } else {
          // No trades or only 1 trade → flat line (honest — no fake curves)
          setPoints([10, 10, 10, 10, 10]);
          setHasData(false);
          setRealChange(0);
        }
      } catch {
        // Keep flat line
      }
    };

    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintAddress, change]);

  // Generate smooth SVG path components
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1 || 1);

  // Smooth curve using cubic bezier approximation
  const commands = points.map((val, i) => {
    const x = i * step;
    const y = height - ((val - min) / range) * height;
    return { x, y };
  });

  const generateSmoothPath = (pts: {x: number, y: number}[]) => {
    if (pts.length === 0) return "";
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i - 1] : pts[0];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = i !== pts.length - 2 ? pts[i + 2] : p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    return d;
  };

  const smoothPath = generateSmoothPath(commands);
  const fillPath = `${smoothPath} L ${width},${height + 5} L 0,${height + 5} Z`;

  const isUp = realChange >= 0;
  const strokeColor = isUp ? "var(--green)" : "var(--red)";
  const gradientId = `sparkline-grad-${mintAddress}`;

  return (
    <svg width={width} height={height} className="card__sparkline" viewBox={`0 -2 ${width} ${height + 4}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* Area Fill */}
      <path
        d={fillPath}
        fill={`url(#${gradientId})`}
        stroke="none"
      />
      {/* Line */}
      <path
        d={smoothPath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
