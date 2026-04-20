// ========================================
// Humanofi — Bonding Curve Chart (Professional Terminal)
// ========================================
// Built with TradingView Lightweight Charts v5.1
// Features:
//   - Timeframe selector (1H, 4H, 1D, 1W, ALL)
//   - AreaSeries for price, HistogramSeries for volume
//   - Real-time pushPrice() via imperative handle
//   - Brutaliste light design matching Humanofi
//   - Professional empty state for 0 trades

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

type Timeframe = "1H" | "4H" | "1D" | "1W" | "ALL";

const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000,
  "1D": 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "ALL": Infinity,
};

// ─── Timezone helper (from TradingView docs: time-zones) ───
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
  function BondingCurveChart({ mintAddress, currentPrice, height = 280 }, ref) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const priceSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const markersRef = useRef<SeriesMarker<Time>[]>([]);
    const allTradesRef = useRef<TradeFromAPI[]>([]);

    const [isReady, setIsReady] = useState(false);
    const [displayPrice, setDisplayPrice] = useState(currentPrice);
    const [firstPrice, setFirstPrice] = useState(0);
    const [tradeCount, setTradeCount] = useState(0);
    const [timeframe, setTimeframe] = useState<Timeframe>("1D");
    const [buyCount, setBuyCount] = useState(0);
    const [sellCount, setSellCount] = useState(0);
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

        const ts =
          nowLocal <= lastPushTimeRef.current
            ? ((lastPushTimeRef.current + 1) as UTCTimestamp)
            : nowLocal;
        lastPushTimeRef.current = ts;

        priceSeriesRef.current.update({ time: ts, value: price });

        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: ts,
            value: price * 0.1,
            color: tradeType === "sell"
              ? "rgba(239, 68, 68, 0.4)"
              : "rgba(16, 185, 129, 0.4)",
          });
        }

        if (tradeType && priceSeriesRef.current) {
          markersRef.current.push({
            time: ts,
            position: tradeType === "buy" ? "belowBar" : "aboveBar",
            color: tradeType === "buy" ? "#10b981" : "#ef4444",
            shape: tradeType === "buy" ? "arrowUp" : "arrowDown",
            text: tradeType === "buy" ? "B" : "S",
          });
          if (markersRef.current.length > 50) {
            markersRef.current = markersRef.current.slice(-50);
          }
          createSeriesMarkers(priceSeriesRef.current, markersRef.current);
        }

        const newPositive = price >= firstPrice;
        priceSeriesRef.current.applyOptions({
          lineColor: newPositive ? "#10b981" : "#ef4444",
          topColor: newPositive
            ? "rgba(16, 185, 129, 0.18)"
            : "rgba(239, 68, 68, 0.12)",
          bottomColor: "rgba(255, 255, 255, 0)",
        });

        setDisplayPrice(price);
        setTradeCount((c) => c + 1);
        chartRef.current?.timeScale().scrollToRealTime();
      },
    }));

    // ── Filter trades by timeframe ──
    const filterTrades = useCallback((trades: TradeFromAPI[], tf: Timeframe) => {
      if (tf === "ALL") return trades;
      const cutoff = Date.now() - TIMEFRAME_MS[tf];
      return trades.filter(t => new Date(t.created_at).getTime() >= cutoff);
    }, []);

    // ── Build chart ──
    const buildChart = useCallback((trades: TradeFromAPI[]) => {
      if (!chartContainerRef.current) return;

      // Count buys/sells
      const buys = trades.filter(t => t.trade_type === "buy").length;
      const sells = trades.filter(t => t.trade_type === "sell").length;
      setBuyCount(buys);
      setSellCount(sells);
      setTradeCount(trades.length);

      // Build price data + volume data + markers
      const priceData: { time: UTCTimestamp; value: number }[] = [];
      const volumeData: { time: UTCTimestamp; value: number; color: string }[] = [];
      const markers: SeriesMarker<Time>[] = [];
      const seen = new Set<number>();

      for (const t of trades) {
        const utcSec = Math.floor(new Date(t.created_at).getTime() / 1000);
        let ts = timeToLocal(utcSec);
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
              ? "rgba(239, 68, 68, 0.5)"
              : "rgba(16, 185, 129, 0.5)",
        });

        markers.push({
          time: ts,
          position: t.trade_type === "buy" ? "belowBar" : "aboveBar",
          color: t.trade_type === "buy" ? "#10b981" : "#ef4444",
          shape: t.trade_type === "buy" ? "arrowUp" : "arrowDown",
          text: t.trade_type === "buy" ? "B" : "S",
        });
      }

      // Baseline if no trades
      const now = timeToLocal(Math.floor(Date.now() / 1000));
      const price = currentPrice || 0;
      if (priceData.length === 0 && price > 0) {
        const fiveMinAgo = (now - 300) as UTCTimestamp;
        priceData.push(
          { time: fiveMinAgo, value: price },
          { time: now, value: price }
        );
      } else if (priceData.length > 0) {
        const lastTs = priceData[priceData.length - 1].time;
        if (now > lastTs && currentPrice > 0) {
          priceData.push({ time: now, value: currentPrice });
        }
      }

      if (priceData.length > 0) {
        setFirstPrice(priceData[0].value);
        setDisplayPrice(priceData[priceData.length - 1].value);
      }

      if (priceData.length > 0) {
        lastPushTimeRef.current = priceData[priceData.length - 1].time;
      }

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
      if (!chartContainerRef.current) return;

      // ── Create chart ──
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "#ffffff" },
          textColor: "rgba(90, 90, 110, 0.7)",
          fontFamily: "var(--font-sans), 'Inter', system-ui, sans-serif",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(0, 0, 0, 0.04)" },
          horzLines: { color: "rgba(0, 0, 0, 0.04)" },
        },
        crosshair: {
          vertLine: {
            color: "rgba(0, 0, 0, 0.15)",
            width: 1,
            style: 2,
            labelBackgroundColor: "var(--accent, #1a1a2e)",
          },
          horzLine: {
            color: "rgba(0, 0, 0, 0.15)",
            width: 1,
            style: 2,
            labelBackgroundColor: "var(--accent, #1a1a2e)",
          },
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.18 },
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

      // ── Area series ──
      const accentGreen = "#10b981";
      const accentRed = "#ef4444";
      const lineColor = trades.length > 0
        ? (trendPositive ? accentGreen : accentRed)
        : "rgba(130, 130, 160, 0.3)";

      const priceSeries = chart.addSeries(AreaSeries, {
        lineColor,
        topColor: trades.length > 0
          ? trendPositive
            ? "rgba(16, 185, 129, 0.18)"
            : "rgba(239, 68, 68, 0.12)"
          : "rgba(130, 130, 160, 0.05)",
        bottomColor: "rgba(255, 255, 255, 0)",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: trades.length > 0 ? lineColor : "#aaa",
      });
      priceSeries.setData(priceData);

      // ── Volume histogram ──
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

      // ── Markers ──
      if (markers.length > 0) {
        markersRef.current = markers.slice(-50);
        createSeriesMarkers(priceSeries, markersRef.current);
      }

      chart.timeScale().fitContent();

      chartRef.current = chart;
      priceSeriesRef.current = priceSeries;
      volumeSeriesRef.current = volumeSeries;
      setIsReady(true);
    }, [currentPrice, height]);

    // ── Initial data fetch ──
    useEffect(() => {
      if (!chartContainerRef.current) return;
      let cancelled = false;

      async function init() {
        let trades: TradeFromAPI[] = [];
        if (mintAddress) {
          trades = await fetchTradeHistory(mintAddress);
        }
        if (cancelled) return;

        allTradesRef.current = trades;
        const filtered = trades.length > 0
          ? trades.filter(t => new Date(t.created_at).getTime() >= Date.now() - TIMEFRAME_MS[timeframe])
          : trades;
        
        // If timeframe filter returns nothing but there are trades, use ALL
        const toDisplay = (filtered.length === 0 && trades.length > 0) ? trades : filtered;
        buildChart(toDisplay);
      }

      init();

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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mintAddress, height]);

    // ── Timeframe switch (re-filter + rebuild) ──
    const handleTimeframeChange = useCallback((tf: Timeframe) => {
      setTimeframe(tf);
      const filtered = filterTrades(allTradesRef.current, tf);
      // If filter returns nothing, show all
      const toDisplay = (filtered.length === 0 && allTradesRef.current.length > 0)
        ? allTradesRef.current
        : filtered;
      buildChart(toDisplay);
    }, [filterTrades, buildChart]);

    const hasTrades = tradeCount > 0;

    return (
      <div className="hm-chart">
        {/* ── Header Row ── */}
        <div className="hm-chart__header">
          <div className="hm-chart__price-block">
            <div className="hm-chart__price">
              {formatPrice(displayPrice)}
              <span className="hm-chart__price-unit">SOL</span>
            </div>
            <div
              className="hm-chart__change"
              style={{ color: isPositive ? "#10b981" : "#ef4444" }}
            >
              {isPositive ? "▲" : "▼"} {isPositive ? "+" : ""}
              {displayChange}%
            </div>
          </div>

          {/* Timeframe Buttons */}
          <div className="hm-chart__controls">
            {(["1H", "4H", "1D", "1W", "ALL"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                className={`hm-chart__tf-btn ${timeframe === tf ? "hm-chart__tf-btn--active" : ""}`}
                onClick={() => handleTimeframeChange(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* ── Trade Stats Strip ── */}
        <div className="hm-chart__stats">
          {hasTrades ? (
            <>
              <div className="hm-chart__stat">
                <span className="hm-chart__stat-dot hm-chart__stat-dot--live" />
                LIVE
              </div>
              <div className="hm-chart__stat">
                <span style={{ color: "#10b981", fontWeight: 800 }}>{buyCount}</span> buys
              </div>
              <div className="hm-chart__stat">
                <span style={{ color: "#ef4444", fontWeight: 800 }}>{sellCount}</span> sells
              </div>
              <div className="hm-chart__stat">
                {tradeCount} total
              </div>
            </>
          ) : (
            <div className="hm-chart__stat" style={{ color: "var(--text-muted)" }}>
              NO TRADES YET — Price reflects initial bonding curve
            </div>
          )}
        </div>

        {/* ── Chart Canvas ── */}
        <div
          ref={chartContainerRef}
          className="hm-chart__canvas"
          style={{ height, opacity: isReady ? 1 : 0 }}
        />

        {/* ── Empty State Overlay ── */}
        {!hasTrades && isReady && (
          <div className="hm-chart__empty">
            <div className="hm-chart__empty-icon">◇</div>
            <div className="hm-chart__empty-title">Awaiting First Trade</div>
            <div className="hm-chart__empty-desc">
              Be the first to invest — the chart will update in real-time with every buy & sell.
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default BondingCurveChart;
