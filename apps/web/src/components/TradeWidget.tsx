// ========================================
// Humanofi — Professional Trade Widget
// ========================================
// Intuitive buy/sell interface with:
//  - SOL + Token balance display
//  - Preset buttons (25%, 50%, 75%, MAX)
//  - SOL/USD toggle for buying
//  - Smart validation (can't exceed balance)
//  - Live estimation with both SOL & USD

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { useHumanofiProgram } from "@/hooks/useHumanofiProgram";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd, solToUsd, estimateBuy, estimateSell } from "@/lib/price";
import {
  Wallet,
  CurrencyDollar,
  ArrowsClockwise,
  CaretDown,
  Coin,
  Lightning,
  ShieldCheck,
} from "@phosphor-icons/react";

// Token-2022
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

// Anti-Snipe: max tokens per wallet during 24h launch window
const ANTI_SNIPE_MAX_TOKENS = 50_000; // 50K tokens (human-readable)

interface TradeWidgetProps {
  tokenColor: string;
  displayName: string;
  tokenSymbol?: string;
  priceNum: number;
  mintAddress?: string;
  isReal: boolean;
  authenticated: boolean;
  rawX: number;
  rawY: number;
  rawK: number;
  hasCurveData: boolean;
  onTrade: (tab: "buy" | "sell", amount: number) => void;
  onLogin: () => void;
  antiSnipeActive?: boolean;
  antiSnipeEndsAt?: number;
}

function formatSol(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(4);
  if (n >= 0.000001) return n.toFixed(6);
  if (n > 0) return n.toExponential(2);
  return "0";
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(2);
  if (n > 0) return n.toFixed(4);
  return "0";
}

export default function TradeWidget({
  tokenColor,
  displayName,
  tokenSymbol,
  priceNum,
  mintAddress,
  isReal,
  authenticated,
  rawX,
  rawY,
  rawK,
  hasCurveData,
  onTrade,
  onLogin,
  antiSnipeActive = false,
  antiSnipeEndsAt = 0,
}: TradeWidgetProps) {
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [inputMode, setInputMode] = useState<"SOL" | "USD">("SOL");

  const { connection, publicKey } = useHumanofiProgram();
  const { priceUsd: solPriceUsd } = useSolPrice();
  const { fundWallet } = useFundWallet();

  // ── Anti-Snipe countdown ──
  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (!antiSnipeActive || !antiSnipeEndsAt) { setCountdown(""); return; }
    const tick = () => {
      const diff = antiSnipeEndsAt - Math.floor(Date.now() / 1000);
      if (diff <= 0) { setCountdown(""); return; }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      setCountdown(`${h}h ${m.toString().padStart(2, "0")}m`);
    };
    tick();
    const iv = setInterval(tick, 30_000); // update every 30s
    return () => clearInterval(iv);
  }, [antiSnipeActive, antiSnipeEndsAt]);

  // Handle SOL purchase via onramp
  const handleBuySol = useCallback(() => {
    if (!publicKey) return;
    fundWallet({ address: publicKey.toBase58() });
  }, [publicKey, fundWallet]);

  // ── Balances ──
  const [solBalance, setSolBalance] = useState<number>(0);
  const [tokenBalance, setTokenBalance] = useState<number>(0);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Fetch balances
  const fetchBalances = useCallback(async () => {
    if (!publicKey || !connection) return;
    setLoadingBalances(true);
    try {
      // SOL balance
      const lamports = await connection.getBalance(publicKey);
      setSolBalance(lamports / LAMPORTS_PER_SOL);

      // Token balance (Token-2022)
      if (mintAddress) {
        try {
          const mint = new PublicKey(mintAddress);
          const ata = getAssociatedTokenAddressSync(
            mint,
            publicKey,
            false,
            TOKEN_2022_PROGRAM_ID
          );
          const tokenAccount = await connection.getTokenAccountBalance(ata);
          const rawAmount = tokenAccount.value.uiAmount || 0;
          setTokenBalance(rawAmount);
        } catch {
          // Token account doesn't exist yet (user hasn't bought)
          setTokenBalance(0);
        }
      }
    } catch (err) {
      console.warn("[TradeWidget] Failed to fetch balances:", err);
    } finally {
      setLoadingBalances(false);
    }
  }, [publicKey, connection, mintAddress]);

  useEffect(() => {
    fetchBalances();
    // Refresh every 15s
    const interval = setInterval(fetchBalances, 15000);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  // ── Anti-Snipe mode flag ──
  const isSnipeBuy = antiSnipeActive && activeTab === "buy";
  const snipeRemaining = Math.max(0, ANTI_SNIPE_MAX_TOKENS - tokenBalance);

  // ── Conversion helpers ──
  const solAmountFromInput = useMemo(() => {
    const parsed = parseFloat(amount) || 0;
    if (activeTab === "buy") {
      if (isSnipeBuy) {
        // In snipe mode, input is in TOKENS → estimate SOL cost
        if (!hasCurveData || parsed <= 0) return 0;
        // Reverse: find SOL needed for `parsed` tokens via binary search approximation
        // Simple approach: use price per token × amount × (1 + fees)
        const pricePerToken = rawX / rawY; // lamports per base unit
        return (parsed * 1e6 * pricePerToken / 1e9) * 1.06; // +6% for fees + slippage margin
      }
      return inputMode === "USD" && solPriceUsd > 0
        ? parsed / solPriceUsd
        : parsed;
    }
    return parsed; // sell: amount is in tokens
  }, [amount, activeTab, inputMode, solPriceUsd, isSnipeBuy, hasCurveData, rawX, rawY]);

  const usdEquivalent = useMemo(() => {
    if (solPriceUsd <= 0) return null;
    const parsed = parseFloat(amount) || 0;
    if (activeTab === "buy") {
      if (isSnipeBuy) {
        return solAmountFromInput * solPriceUsd;
      }
      if (inputMode === "SOL") return parsed * solPriceUsd;
      return parsed; // already USD
    }
    // Sell: show USD value of SOL they'd receive
    const solReceive = hasCurveData
      ? estimateSell(rawX, rawY, rawK, parsed * 1e6).solNet / 1e9
      : parsed * priceNum;
    return solReceive * solPriceUsd;
  }, [amount, activeTab, inputMode, solPriceUsd, hasCurveData, rawX, rawY, rawK, priceNum, isSnipeBuy, solAmountFromInput]);

  // ── Estimate ──
  const estimate = useMemo(() => {
    const parsed = parseFloat(amount) || 0;
    if (parsed <= 0) return { value: "0", label: "", sol: "", usd: undefined as string | undefined };

    if (activeTab === "buy") {
      if (isSnipeBuy) {
        // Input is tokens → show SOL cost
        const solCost = solAmountFromInput;
        return {
          value: formatSol(solCost),
          label: "SOL",
          sol: formatSol(solCost),
          usd: solPriceUsd > 0 ? formatUsd(solCost * solPriceUsd) : undefined,
        };
      }
      const solAmt = solAmountFromInput;
      const tokensOut = hasCurveData
        ? estimateBuy(rawX, rawY, rawK, solAmt * 1e9).tokensBuyer / 1e6
        : solAmt / (priceNum || 1);
      return {
        value: formatTokens(tokensOut),
        label: `${displayName.split(" ")[0].toUpperCase()} tokens`,
        sol: "",
        usd: undefined,
      };
    } else {
      const solOut = hasCurveData
        ? estimateSell(rawX, rawY, rawK, parsed * 1e6).solNet / 1e9
        : parsed * (priceNum || 0);
      return {
        value: formatSol(solOut),
        label: "SOL",
        sol: "",
        usd: solPriceUsd > 0 ? formatUsd(solOut * solPriceUsd) : undefined,
      };
    }
  }, [amount, activeTab, solAmountFromInput, hasCurveData, rawX, rawY, rawK, priceNum, solPriceUsd, displayName, isSnipeBuy]);

  // Validation
  const inputError = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return null;
    if (activeTab === "buy") {
      if (isSnipeBuy) {
        // In snipe mode, input is tokens
        if (parsed > snipeRemaining) {
          return snipeRemaining > 0
            ? `Fair Launch: max ${formatTokens(snipeRemaining)} more tokens`
            : "Fair Launch limit reached (50K tokens max)";
        }
        // Also check SOL
        if (solBalance > 0 && solAmountFromInput > solBalance) return "Insufficient SOL balance";
      } else {
        const solNeeded = solAmountFromInput;
        if (solBalance > 0 && solNeeded > solBalance) return "Insufficient SOL balance";
      }
    } else {
      if (tokenBalance > 0 && parsed > tokenBalance) return "Insufficient token balance";
    }
    return null;
  }, [amount, activeTab, solAmountFromInput, solBalance, tokenBalance, isSnipeBuy, snipeRemaining]);

  // ── Anti-Snipe token presets ──
  const snipePresets = [
    { label: "5K", tokens: 5_000 },
    { label: "10K", tokens: 10_000 },
    { label: "20K", tokens: 20_000 },
    { label: "30K", tokens: 30_000 },
    { label: "40K", tokens: 40_000 },
    { label: "50K", tokens: 50_000 },
  ];

  // Normal presets
  const normalPresets = [
    { label: "25%", factor: 0.25 },
    { label: "50%", factor: 0.5 },
    { label: "75%", factor: 0.75 },
    { label: "MAX", factor: 1 },
  ];

  const handleSnipePreset = (tokens: number) => {
    const capped = Math.min(tokens, snipeRemaining);
    if (capped <= 0) return;
    setAmount(capped.toFixed(0));
  };

  const handlePreset = (factor: number) => {
    if (activeTab === "buy") {
      // Leave a tiny reserve for fees (~0.005 SOL)
      const maxBuy = Math.max(0, solBalance - 0.005);
      const val = maxBuy * factor;
      if (inputMode === "USD" && solPriceUsd > 0) {
        setAmount((val * solPriceUsd).toFixed(2));
      } else {
        setAmount(val > 0.01 ? val.toFixed(4) : val.toFixed(6));
      }
    } else {
      const val = tokenBalance * factor;
      setAmount(val > 1 ? val.toFixed(2) : val.toFixed(4));
    }
  };

  const toggleInputMode = () => {
    const parsed = parseFloat(amount) || 0;
    if (inputMode === "SOL" && solPriceUsd > 0) {
      setInputMode("USD");
      if (parsed > 0) setAmount((parsed * solPriceUsd).toFixed(2));
    } else {
      setInputMode("SOL");
      if (parsed > 0 && solPriceUsd > 0) setAmount((parsed / solPriceUsd).toFixed(4));
    }
  };

  const handleSubmit = () => {
    if (!authenticated) { onLogin(); return; }
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;
    if (inputError) return;

    if (activeTab === "buy") {
      // In snipe mode, input is in tokens → convert to SOL for onTrade
      onTrade("buy", solAmountFromInput);
    } else {
      onTrade("sell", parsed);
    }
  };

  const tokenShort = tokenSymbol || displayName.split(" ")[0].toUpperCase();

  return (
    <div className="trade-widget" style={{ borderColor: tokenColor }}>
      {/* Header */}
      <div className="trade-widget__header">
        <span className="trade-widget__title">{isReal ? "Trade" : "Demo Mode"}</span>
      </div>

      {/* Tabs */}
      <div className="trade-widget__tabs">
        <button
          className={`trade-tab ${activeTab === "buy" ? "active" : ""}`}
          style={activeTab === "buy" ? { background: tokenColor, borderColor: tokenColor } : {}}
          onClick={() => { setActiveTab("buy"); setAmount(""); setInputMode("SOL"); }}
        >
          Buy
        </button>
        <button
          className={`trade-tab ${activeTab === "sell" ? "active" : ""}`}
          style={activeTab === "sell" ? { background: "#e53e3e", borderColor: "#e53e3e" } : {}}
          onClick={() => { setActiveTab("sell"); setAmount(""); }}
        >
          Sell
        </button>
      </div>

      {/* Balance display */}
      {authenticated && publicKey && (
        <div className="trade-widget__balance">
          <div className="trade-widget__balance-row">
            <Wallet size={13} weight="bold" />
            <span>
              {activeTab === "buy" ? "SOL Balance" : `${tokenShort} Balance`}
            </span>
            <strong>
              {loadingBalances ? "..." :
                activeTab === "buy"
                  ? `${formatSol(solBalance)} SOL`
                  : `${formatTokens(tokenBalance)} ${tokenShort}`
              }
            </strong>
            {activeTab === "buy" && solPriceUsd > 0 && solBalance > 0 && (
              <span className="trade-widget__balance-usd">
                ≈ {formatUsd(solBalance * solPriceUsd)}
              </span>
            )}
            <button
              className="trade-widget__refresh-btn"
              onClick={fetchBalances}
              title="Refresh balance"
            >
              <ArrowsClockwise size={12} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Onramp CTA — SOL = 0 */}
      {authenticated && publicKey && !loadingBalances && solBalance < 0.001 && activeTab === "buy" && (
        <div className="trade-widget__onramp-banner">
          <Lightning size={18} weight="fill" />
          <div>
            <strong>You need SOL to buy this token</strong>
            <p style={{ margin: "4px 0 0", fontSize: "0.75rem", opacity: 0.8 }}>
              Buy SOL instantly with your card, Apple Pay or Google Pay
            </p>
          </div>
          <button className="trade-widget__onramp-btn" onClick={handleBuySol}>
            Buy SOL
          </button>
        </div>
      )}

      {/* Input */}
      <div className="trade-widget__input-group">
        <div className="trade-widget__input-header">
          <label className="trade-widget__label">
            {isSnipeBuy
              ? `Tokens to buy (max ${formatTokens(snipeRemaining)})`
              : activeTab === "buy"
                ? (inputMode === "USD" ? "Amount in USD" : "Amount in SOL")
                : `Amount of ${tokenShort}`
            }
          </label>
          {activeTab === "buy" && !isSnipeBuy && solPriceUsd > 0 && (
            <button className="trade-widget__mode-toggle" onClick={toggleInputMode}>
              <ArrowsClockwise size={11} weight="bold" />
              {inputMode === "SOL" ? "USD" : "SOL"}
            </button>
          )}
        </div>

        <div className="trade-widget__input-wrapper">
          <input
            type="number"
            className={`trade-input ${inputError ? "trade-input--error" : ""}`}
            placeholder={isSnipeBuy ? "e.g. 10000" : "0.00"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            max={isSnipeBuy ? snipeRemaining : undefined}
            step={isSnipeBuy ? "1000" : "any"}
          />
          <span className="trade-widget__input-suffix">
            {isSnipeBuy
              ? "tokens"
              : activeTab === "buy"
                ? inputMode === "USD" ? "$" : "SOL"
                : tokenShort
            }
          </span>
        </div>

        {/* SOL cost estimate in snipe mode */}
        {isSnipeBuy && amount && solAmountFromInput > 0 && (
          <div className="trade-widget__input-sub">
            ≈ {formatSol(solAmountFromInput)} SOL
            {solPriceUsd > 0 && ` (${formatUsd(solAmountFromInput * solPriceUsd)})`}
          </div>
        )}

        {/* USD equivalent when typing in SOL (normal mode) */}
        {!isSnipeBuy && activeTab === "buy" && amount && usdEquivalent !== null && usdEquivalent > 0 && (
          <div className="trade-widget__input-sub">
            ≈ {inputMode === "SOL" ? formatUsd(usdEquivalent) : `${formatSol(usdEquivalent / solPriceUsd)} SOL`}
          </div>
        )}

        {inputError && (
          <div className="trade-widget__input-error">
            {inputError}
            {inputError === "Insufficient SOL balance" && (
              <button
                className="trade-widget__onramp-inline"
                onClick={handleBuySol}
              >
                <Lightning size={12} weight="fill" /> Buy SOL
              </button>
            )}
          </div>
        )}
      </div>

      {/* Presets — Token presets in snipe mode, SOL% presets otherwise */}
      {isSnipeBuy ? (
        <div className="trade-widget__presets trade-widget__presets--snipe">
          {snipePresets.map((p) => {
            const disabled = p.tokens > snipeRemaining || solBalance <= 0.005;
            const isActive = amount === String(Math.min(p.tokens, snipeRemaining));
            return (
              <button
                key={p.label}
                className={`trade-widget__preset ${isActive ? "trade-widget__preset--active" : ""} ${p.tokens > snipeRemaining ? "trade-widget__preset--over" : ""}`}
                onClick={() => handleSnipePreset(p.tokens)}
                disabled={disabled}
                style={isActive ? { background: tokenColor, borderColor: tokenColor, color: "#fff" } : {}}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="trade-widget__presets">
          {normalPresets.map((p) => (
            <button
              key={p.label}
              className="trade-widget__preset"
              onClick={() => handlePreset(p.factor)}
              disabled={
                activeTab === "buy" ? solBalance <= 0.005 : tokenBalance <= 0
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Estimate */}
      {parseFloat(amount) > 0 && (
        <div className="trade-widget__estimate">
          <span>{isSnipeBuy ? "Estimated cost" : `You will ${activeTab === "buy" ? "receive" : "get"}`}</span>
          <span style={{ color: "var(--text)", fontWeight: 800 }}>
            ~{estimate.value} {estimate.label}
            {estimate.usd && (
              <span className="trade-widget__estimate-usd"> ({estimate.usd})</span>
            )}
          </span>
        </div>
      )}

      {/* Submit */}
      <button
        className="trade-widget__btn"
        style={{
          background: activeTab === "buy" ? tokenColor : "#e53e3e",
          opacity: isReal && !inputError ? 1 : 0.5,
        }}
        onClick={handleSubmit}
        disabled={!isReal || !!inputError}
      >
        {!authenticated
          ? "Connect Wallet"
          : !isReal
            ? "Demo — Create a Token First"
            : activeTab === "buy"
              ? `Buy ${tokenShort}`
              : `Sell ${tokenShort}`
        }
      </button>

      {/* Quick Stats */}
      <div className="trade-widget__stats">
        <div className="trade-widget__stat">
          <CurrencyDollar size={14} weight="bold" />
          <span>Price</span>
          <strong>{priceNum > 0 ? `${formatSol(priceNum)} SOL` : "—"}</strong>
          {solPriceUsd > 0 && priceNum > 0 && (
            <span className="trade-widget__stat-sub">
              {formatUsd(solToUsd(priceNum, solPriceUsd))}
            </span>
          )}
        </div>
        <div className="trade-widget__stat">
          <Coin size={14} weight="bold" />
          <span>Your {tokenShort}</span>
          <strong>{formatTokens(tokenBalance)}</strong>
        </div>
      </div>
    </div>
  );
}
