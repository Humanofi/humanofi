// ========================================
// Humanofi — Bonding Curve Chart (TradingView Lightweight Charts)
// ========================================
// Professional-grade financial chart for token price history.
// Reads from Supabase price history or generates mock data.

"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, AreaSeries, type IChartApi, type ISeriesApi, ColorType } from "lightweight-charts";

interface BondingCurveChartProps {
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
 * In production, this would be replaced by real price history from Supabase.
 */
function generateMockData(sparkline: number[], currentPrice: number) {
  const now = new Date();
  const basePrice = currentPrice * 0.7; // Start 30% lower
  const range = currentPrice - basePrice;

  return sparkline.map((val, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (sparkline.length - i));

    const normalizedVal = val / 20; // sparkline values are 0-20
    const price = basePrice + range * normalizedVal;

    return {
      time: date.toISOString().split("T")[0],
      value: parseFloat(price.toFixed(6)),
    };
  });
}

export default function BondingCurveChart({
  currentPrice,
  change,
  sparkline = [],
  height = 220,
}: BondingCurveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clear previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const isPositive = change >= 0;
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

    // Generate data
    const data = generateMockData(
      sparkline.length > 0 ? sparkline : Array.from({ length: 30 }, () => Math.floor(Math.random() * 18) + 3),
      currentPrice
    );

    areaSeries.setData(data as { time: string; value: number }[]);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = areaSeries;
    setIsReady(true);

    // Handle resize
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
  }, [currentPrice, change, sparkline, height]);

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
          color: change >= 0 ? "var(--up)" : "var(--down)",
          fontWeight: 800,
          fontSize: "1rem",
        }}>
          {change >= 0 ? "+" : ""}{change}%
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
