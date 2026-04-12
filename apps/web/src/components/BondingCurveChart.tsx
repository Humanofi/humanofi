// ========================================
// Humanofi — Bonding Curve Chart (Professional Area + Volume)
// ========================================
// Built strictly per TradingView Lightweight Charts v5.1 documentation:
//   - AreaSeries for price (SingleValueData format)
//   - HistogramSeries for volume overlay
//   - series.update() for realtime pushes
//   - createSeriesMarkers() for buy/sell indicators
//   - timeToLocal() for timezone correction (doc: time-zones)
//   - applyOptions() for dynamic color switching
//
// Timestamps: UNIX seconds (UTCTimestamp), adjusted to local timezone.
// Data format: { time: UTCTimestamp, value: number }

"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import {
  createChart,
  AreaSeries,
  HistogramSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";

// ─── Types ───

interface TradeFromAPI {
  trade_type: string;
  price_sol: number;
  sol_amount: number;
  token_amount: number;
  tx_signature: string;
  created_at: string;
}

export interface BondingCurveChartHandle {
  /** Push a live price tick to the chart */
  pushPrice: (price: number, tradeType?: "buy" | "sell") => void;
}

interface BondingCurveChartProps {
  mintAddress?: string;
  currentPrice: number;
  height?: number;
}

// ─── Timezone helper (from TradingView docs: time-zones) ───
// Lightweight Charts processes everything in UTC.
// This shifts UTC→local so the axis shows the user's local time.
function timeToLocal(utcSeconds: number): UTCTimestamp {
  const d = new Date(utcSeconds * 1000);
  return (
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds()
    ) / 1000
  ) as UTCTimestamp;
}

function formatPrice(n: number): string {
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.01) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  if (n >= 0.000001) return n.toFixed(8);
  if (n > 0) return n.toExponential(2);
  return "0";
}

// ─── Fetch historical trades ───
async function fetchTradeHistory(mintAddress: string) {
  try {
    const res = await fetch(`/api/trades?mint=${mintAddress}&limit=500`);
    if (!res.ok) return [];
    const { trades } = (await res.json()) as { trades: TradeFromAPI[] };
    return trades || [];
  } catch {
    return [];
  }
}

// ─── Component ───

const BondingCurveChart = forwardRef<BondingCurveChartHandle, BondingCurveChartProps>(
  function BondingCurveChart({ mintAddress, currentPrice, height = 260 }, ref) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const priceSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<SeriesMarker<Time>[]>([]);

    const [isReady, setIsReady] = useState(false);
    const [displayPrice, setDisplayPrice] = useState(currentPrice);
    const [firstPrice, setFirstPrice] = useState(0);
    const [tradeCount, setTradeCount] = useState(0);
    const lastPushTimeRef = useRef<number>(0);

    // Derived: % change
    const displayChange = useMemo(() => {
      if (firstPrice <= 0 || displayPrice <= 0) return 0;
      return parseFloat(((displayPrice - firstPrice) / firstPrice * 100).toFixed(1));
    }, [displayPrice, firstPrice]);

    const isPositive = displayChange >= 0;

    // Update display price from parent
    useEffect(() => {
      if (currentPrice > 0) setDisplayPrice(currentPrice);
    }, [currentPrice]);

    // ── Expose pushPrice to parent ──
    useImperativeHandle(ref, () => ({
      pushPrice: (price: number, tradeType?: "buy" | "sell") => {
        if (!priceSeriesRef.current || price <= 0) return;

        const nowUtc = Math.floor(Date.now() / 1000);
        const nowLocal = timeToLocal(nowUtc);

        // Ensure strictly ascending timestamps (requirement from docs)
        const ts =
          nowLocal <= lastPushTimeRef.current
            ? ((lastPushTimeRef.current + 1) as UTCTimestamp)
            : nowLocal;
        lastPushTimeRef.current = ts;

        // Update price series
        priceSeriesRef.current.update({ time: ts, value: price });

        // Update volume histogram (show trade as a bar)
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: ts,
            value: price * 0.1, // Visual volume indicator
            color: tradeType === "sell"
              ? "rgba(239, 68, 68, 0.4)"
              : "rgba(16, 185, 129, 0.4)",
          });
        }

        // Add marker for the trade (buy/sell arrow)
        if (tradeType && priceSeriesRef.current) {
          markersRef.current.push({
            time: ts,
            position: tradeType === "buy" ? "belowBar" : "aboveBar",
            color: tradeType === "buy" ? "#10b981" : "#ef4444",
            shape: tradeType === "buy" ? "arrowUp" : "arrowDown",
            text: tradeType === "buy" ? "B" : "S",
          });
          // Keep only last 50 markers
          if (markersRef.current.length > 50) {
            markersRef.current = markersRef.current.slice(-50);
          }
          createSeriesMarkers(priceSeriesRef.current, markersRef.current);
        }

        // Dynamic color switch based on trend (via applyOptions per docs)
        const newPositive = price >= firstPrice;
        priceSeriesRef.current.applyOptions({
          lineColor: newPositive ? "#10b981" : "#ef4444",
          topColor: newPositive
            ? "rgba(16, 185, 129, 0.28)"
            : "rgba(239, 68, 68, 0.2)",
          bottomColor: "rgba(0, 0, 0, 0)",
        });

        setDisplayPrice(price);
        setTradeCount((c) => c + 1);

        // Auto-scroll to latest
        chartRef.current?.timeScale().scrollToRealTime();
      },
    }));

    // ── Build chart ──
    useEffect(() => {
      if (!chartContainerRef.current) return;

      let cancelled = false;

      async function init() {
        // Load historical trades
        let trades: TradeFromAPI[] = [];
        if (mintAddress) {
          trades = await fetchTradeHistory(mintAddress);
        }
        if (cancelled) return;

        setTradeCount(trades.length);

        // Build price data + volume data + markers from trades
        const priceData: { time: UTCTimestamp; value: number }[] = [];
        const volumeData: { time: UTCTimestamp; value: number; color: string }[] = [];
        const markers: SeriesMarker<Time>[] = [];
        const seen = new Set<number>();

        for (const t of trades) {
          const utcSec = Math.floor(new Date(t.created_at).getTime() / 1000);
          let ts = timeToLocal(utcSec);
          // Ensure unique timestamps (strictly ascending)
          while (seen.has(ts)) {
            ts = (ts + 1) as UTCTimestamp;
          }
          seen.add(ts);

          const price = parseFloat(Number(t.price_sol).toFixed(8));
          priceData.push({ time: ts, value: price });

          volumeData.push({
            time: ts,
            value: price * 0.1,
            color:
              t.trade_type === "sell"
                ? "rgba(239, 68, 68, 0.4)"
                : "rgba(16, 185, 129, 0.4)",
          });

          markers.push({
            time: ts,
            position: t.trade_type === "buy" ? "belowBar" : "aboveBar",
            color: t.trade_type === "buy" ? "#10b981" : "#ef4444",
            shape: t.trade_type === "buy" ? "arrowUp" : "arrowDown",
            text: t.trade_type === "buy" ? "B" : "S",
          });
        }

        // If no trades, create baseline from current price
        const now = timeToLocal(Math.floor(Date.now() / 1000));
        const price = currentPrice || 0;
        if (priceData.length === 0 && price > 0) {
          const fiveMinAgo = (now - 300) as UTCTimestamp;
          priceData.push(
            { time: fiveMinAgo, value: price },
            { time: now, value: price }
          );
        } else if (priceData.length > 0) {
          // Add current price as latest point
          const lastTs = priceData[priceData.length - 1].time;
          if (now > lastTs && currentPrice > 0) {
            priceData.push({ time: now, value: currentPrice });
          }
        }

        // Set first price for % change calculation
        if (priceData.length > 0) {
          setFirstPrice(priceData[0].value);
          setDisplayPrice(priceData[priceData.length - 1].value);
        }

        // Track last time for pushPrice
        if (priceData.length > 0) {
          lastPushTimeRef.current = priceData[priceData.length - 1].time;
        }

        // Determine trend
        const trendPositive =
          priceData.length >= 2
            ? priceData[priceData.length - 1].value >= priceData[0].value
            : true;

        // Clean up old chart
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          priceSeriesRef.current = null;
          volumeSeriesRef.current = null;
        }
        if (!chartContainerRef.current || cancelled) return;

        // ── Create chart (per docs: createChart) ──
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "rgba(120, 120, 140, 0.8)",
            fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
            fontSize: 10,
          },
          grid: {
            vertLines: { color: "rgba(120, 120, 180, 0.04)" },
            horzLines: { color: "rgba(120, 120, 180, 0.04)" },
          },
          crosshair: {
            vertLine: {
              color: "rgba(100, 100, 255, 0.25)",
              width: 1,
              style: 2,
              labelBackgroundColor: "#1a1a2e",
            },
            horzLine: {
              color: "rgba(100, 100, 255, 0.25)",
              width: 1,
              style: 2,
              labelBackgroundColor: "#1a1a2e",
            },
          },
          rightPriceScale: {
            borderVisible: false,
            scaleMargins: { top: 0.12, bottom: 0.2 },
          },
          timeScale: {
            borderVisible: false,
            timeVisible: true,
            secondsVisible: false,
            fixLeftEdge: true,
            fixRightEdge: true,
            rightOffset: 5,
          },
          handleScale: { axisPressedMouseMove: { time: true, price: false } },
          handleScroll: { vertTouchDrag: false },
        });

        // ── Area series for price (docs: AreaSeries, SingleValueData) ──
        const lineColor = trendPositive ? "#10b981" : "#ef4444";
        const priceSeries = chart.addSeries(AreaSeries, {
          lineColor: trades.length > 0 ? lineColor : "rgba(100, 100, 140, 0.3)",
          topColor: trades.length > 0
            ? trendPositive
              ? "rgba(16, 185, 129, 0.28)"
              : "rgba(239, 68, 68, 0.2)"
            : "rgba(100, 100, 140, 0.05)",
          bottomColor: "rgba(0, 0, 0, 0)",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBackgroundColor: trades.length > 0 ? lineColor : "#888",
        });
        priceSeries.setData(priceData);

        // ── Histogram series for volume (docs: HistogramSeries) ──
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
        volumeSeries.priceScale().applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 },
        });
        if (volumeData.length > 0) {
          volumeSeries.setData(volumeData);
        }

        // ── Markers for buy/sell (docs: createSeriesMarkers) ──
        if (markers.length > 0) {
          markersRef.current = markers.slice(-50);
          createSeriesMarkers(priceSeries, markersRef.current);
        }

        chart.timeScale().fitContent();

        chartRef.current = chart;
        priceSeriesRef.current = priceSeries;
        volumeSeriesRef.current = volumeSeries;
        setIsReady(true);
      }

      init();

      // Resize handler
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
          priceSeriesRef.current = null;
          volumeSeriesRef.current = null;
        }
      };
      // Only re-init when mintAddress changes (not on every price update)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mintAddress, height]);

    return (
      <div className="profile-chart-container">
        {/* Header */}
        <div className="profile-chart-header">
          <div>
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-faint)",
                marginBottom: 2,
              }}
            >
              Bonding Curve
            </div>
            <div
              style={{
                fontSize: "1.3rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatPrice(displayPrice)}{" "}
              <span style={{ fontSize: "0.7em", color: "var(--text-faint)" }}>
                SOL
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <div
              style={{
                color: isPositive ? "#10b981" : "#ef4444",
                fontWeight: 800,
                fontSize: "1rem",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {isPositive ? "+" : ""}
              {displayChange}%
            </div>
            {tradeCount > 0 ? (
              <div
                style={{
                  fontSize: "0.6rem",
                  color: "var(--text-faint)",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                    animation: "pulse 2s infinite",
                  }}
                />
                LIVE · {tradeCount} trades
              </div>
            ) : (
              <div
                style={{
                  fontSize: "0.6rem",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Awaiting first trade
              </div>
            )}
          </div>
        </div>

        {/* Chart canvas */}
        <div
          ref={chartContainerRef}
          style={{
            width: "100%",
            height,
            opacity: isReady ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}
        />
      </div>
    );
  }
);

export default BondingCurveChart;
