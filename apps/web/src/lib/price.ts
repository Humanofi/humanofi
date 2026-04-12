// ========================================
// Humanofi — Price & Curve Utilities
// ========================================
//
// Client-side implementations of the Human Curve™ formulas
// for the web frontend (estimations, display, previews).
//
// PRECISION: k values exceed Number.MAX_SAFE_INTEGER.
// All k-dependent divisions use BigInt for exact results.

// ---- Constants (match on-chain constants.rs v3.6) ----

const TOTAL_FEE_BPS = 500;          // 5% total fee (holder buy/sell)
const FEE_DEPTH_BPS = 100;          // 1% k-deepening
// Merit Reward REMOVED in v3.6 — buyer gets 100% of tokens
const BPS_DENOMINATOR = 10_000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 1_000_000;     // 10^6

// ---- Types ----

export interface BuyEstimate {
  tokensBuyer: number;      // Tokens the buyer receives (100%)
  tokensTotal: number;      // Total tokens produced by the curve
  effectivePrice: number;   // SOL per whole token (all-inclusive)
  feeTotal: number;         // Total fee in SOL
  priceImpact: number;      // Price impact percentage
}

export interface SellEstimate {
  solGross: number;         // SOL before fees
  solNet: number;           // SOL the seller receives
  feeTotal: number;         // Total fee in SOL
  priceImpact: number;      // Price impact percentage
}

// ---- BigInt-safe division ----

/**
 * Compute k / divisor using BigInt to avoid precision loss.
 * k values in Humanofi are ~2.1e21, well above Number.MAX_SAFE_INTEGER (9e15).
 */
function bigDiv(k: number, divisor: number): number {
  if (divisor === 0) return 0;
  const kBig = BigInt(Math.round(k));
  const dBig = BigInt(Math.round(divisor));
  return Number(kBig / dBig);
}

// ---- Human Curve™ Functions ----

/**
 * Calculate the spot price P = x / y
 * @param x - Total curve reserve (lamports) = sol_reserve + depth_parameter D
 * @param y - Token reserve counter (base units)
 * @returns Price in SOL per whole token
 */
export function spotPrice(x: number, y: number): number {
  if (y === 0) return 0;
  return (x / y) * TOKEN_DECIMALS;
}

/**
 * Spot price in USD
 */
export function spotPriceUsd(x: number, y: number, solPriceUsd: number): number {
  return lamportsToUsd(spotPrice(x, y), solPriceUsd);
}

/**
 * Estimate the result of a buy for a given SOL amount.
 * Mirrors the on-chain calculate_buy() logic.
 * Uses BigInt for k-dependent divisions.
 * @param x - Current x reserve (lamports)
 * @param y - Current y reserve (base units)
 * @param k - Current k invariant (may exceed MAX_SAFE_INTEGER)
 * @param solBrut - SOL to spend (lamports)
 */
export function estimateBuy(
  x: number,
  y: number,
  k: number,
  solBrut: number
): BuyEstimate {
  // Step 1: Fees (5%)
  const feeTotal = Math.ceil(solBrut * TOTAL_FEE_BPS / BPS_DENOMINATOR);
  const feeDepth = Math.ceil(solBrut * FEE_DEPTH_BPS / BPS_DENOMINATOR);
  const solToCurve = solBrut - feeTotal;

  // Step 2: k-deepening
  const xAfterDepth = x + feeDepth;
  const kAfterDepth = xAfterDepth * y;  // Still safe for typical values

  // Step 3: SOL enters curve
  const xNew = xAfterDepth + solToCurve;

  // BigInt division to avoid precision loss on k / xNew
  const yNew = bigDiv(kAfterDepth, xNew);

  // Step 4: 100% tokens to buyer (Merit removed in v3.6)
  const tokensTotal = y - yNew;
  const tokensBuyer = tokensTotal;

  // Effective price (SOL per whole token, all-inclusive)
  const effectivePrice = tokensBuyer > 0
    ? (solBrut / tokensBuyer) * TOKEN_DECIMALS
    : 0;

  // Price impact: (P_after - P_before) / P_before
  const pBefore = x / y;
  const pAfter = yNew > 0 ? xNew / yNew : 0;
  const priceImpact = pBefore > 0 ? ((pAfter - pBefore) / pBefore) * 100 : 0;

  return {
    tokensBuyer,
    tokensTotal,
    effectivePrice,
    feeTotal,
    priceImpact,
  };
}

/**
 * Estimate the result of a sell for a given token amount.
 * Mirrors the on-chain calculate_sell() logic.
 * Uses BigInt for k-dependent divisions.
 * @param x - Current x reserve (lamports)
 * @param y - Current y reserve (base units)
 * @param k - Current k invariant (may exceed MAX_SAFE_INTEGER)
 * @param tokenAmount - Tokens to sell (base units)
 * @param isCreator - If true, uses 6% creator sell fee instead of 5%
 */
export function estimateSell(
  x: number,
  y: number,
  k: number,
  tokenAmount: number,
  isCreator: boolean = false
): SellEstimate {
  // Step 1: Tokens return to y
  const yNew = y + tokenAmount;

  // Step 2: Calculate gross SOL (BigInt for k / yNew)
  const xAfter = bigDiv(k, yNew);
  const solGross = x - xAfter;

  // Step 3: Fees — dual structure (holder 5% / creator 6%)
  const feeBps = isCreator ? 600 : TOTAL_FEE_BPS;
  const feeTotal = Math.ceil(solGross * feeBps / BPS_DENOMINATOR);
  const solNet = solGross - feeTotal;

  // Price impact
  const pBefore = x / y;
  const feeDepth = Math.ceil(solGross * FEE_DEPTH_BPS / BPS_DENOMINATOR);
  const xFinal = x - solGross + feeDepth;
  const pAfter = yNew > 0 ? xFinal / yNew : 0;
  const priceImpact = pBefore > 0 ? ((pBefore - pAfter) / pBefore) * 100 : 0;

  return {
    solGross,
    solNet,
    feeTotal,
    priceImpact,
  };
}

// ---- SOL/USD Conversion ----

/**
 * Convert SOL amount (in lamports) to USD using oracle price.
 * @param lamports - Amount in lamports (1 SOL = 1,000,000,000 lamports)
 * @param solPriceUsd - Current SOL/USD price from oracle
 * @returns USD value
 */
export function lamportsToUsd(lamports: number, solPriceUsd: number): number {
  return (lamports / LAMPORTS_PER_SOL) * solPriceUsd;
}

/**
 * Convert SOL amount to USD.
 * @param sol - Amount in SOL
 * @param solPriceUsd - Current SOL/USD price from oracle
 * @returns USD value
 */
export function solToUsd(sol: number, solPriceUsd: number): number {
  return sol * solPriceUsd;
}

/**
 * Format a USD amount for display.
 * @param usd - Amount in USD
 * @returns Formatted string like "$1,234.56" or "$0.0042"
 */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00";

  if (usd >= 1) {
    return "$" + usd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // For small values, show more precision
  if (usd >= 0.01) {
    return "$" + usd.toFixed(4);
  }

  return "$" + usd.toFixed(6);
}

/**
 * Format SOL amount for display (canonical version — use this everywhere).
 * Handles large values with K suffix, small values with extra precision.
 * @param sol - Amount in SOL
 * @returns Formatted string like "1.234 SOL"
 */
export function formatSol(sol: number): string {
  if (sol >= 1000) return (sol / 1000).toFixed(1) + "K SOL";
  if (sol >= 1) return sol.toFixed(3) + " SOL";
  if (sol >= 0.0001) return sol.toFixed(4) + " SOL";
  if (sol >= 0.000001) return sol.toFixed(6) + " SOL";
  if (sol > 0) return sol.toExponential(2) + " SOL";
  return "0 SOL";
}

/**
 * Format SOL amount without " SOL" suffix (for inline display).
 * @param sol - Amount in SOL
 * @returns Formatted number string
 */
export function formatSolShort(sol: number): string {
  if (sol >= 1000) return (sol / 1000).toFixed(1) + "K";
  if (sol >= 1) return sol.toFixed(3);
  if (sol >= 0.0001) return sol.toFixed(4);
  if (sol >= 0.000001) return sol.toFixed(6);
  if (sol > 0) return sol.toExponential(2);
  return "0";
}
