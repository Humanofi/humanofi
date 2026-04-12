// ========================================
// Humanofi — Price & Curve Utilities
// ========================================
//
// Client-side implementations of the Human Curve™ formulas
// for the web frontend (estimations, display, previews).

// ---- Constants (match on-chain constants.rs) ----

const TOTAL_FEE_BPS = 600;          // 6% total fee
const FEE_DEPTH_BPS = 100;          // 1% k-deepening
const ALPHA_CREATOR_BPS = 1_000;    // 10% Merit Reward → creator
const ALPHA_PROTOCOL_BPS = 400;     // 4% Merit Fee → protocol
const BPS_DENOMINATOR = 10_000;
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 1_000_000;     // 10^6

// ---- Types ----

export interface BuyEstimate {
  tokensBuyer: number;      // Tokens the buyer receives (86%)
  tokensCreator: number;    // Tokens the creator receives (10% Merit Reward)
  tokensProtocol: number;   // Tokens the protocol receives (4% Merit Fee)
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
 * @param x - Current x reserve (lamports)
 * @param y - Current y reserve (base units)
 * @param k - Current k invariant
 * @param solBrut - SOL to spend (lamports)
 */
export function estimateBuy(
  x: number,
  y: number,
  k: number,
  solBrut: number
): BuyEstimate {
  // Step 1: Fees (6%)
  const feeTotal = Math.ceil(solBrut * TOTAL_FEE_BPS / BPS_DENOMINATOR);
  const feeDepth = Math.ceil(solBrut * FEE_DEPTH_BPS / BPS_DENOMINATOR);
  const solToCurve = solBrut - feeTotal;

  // Step 2: k-deepening
  const xAfterDepth = x + feeDepth;
  const kAfterDepth = xAfterDepth * y;

  // Step 3: SOL enters curve
  const xNew = xAfterDepth + solToCurve;
  const yNew = kAfterDepth / xNew;

  // Step 4: Tokens — merit split 10% creator + 4% protocol
  const tokensTotal = y - yNew;
  const tokensCreator = Math.floor(tokensTotal * ALPHA_CREATOR_BPS / BPS_DENOMINATOR);
  const tokensProtocol = Math.floor(tokensTotal * ALPHA_PROTOCOL_BPS / BPS_DENOMINATOR);
  const tokensBuyer = tokensTotal - tokensCreator - tokensProtocol;

  // Effective price (SOL per whole token, all-inclusive)
  const effectivePrice = tokensBuyer > 0
    ? (solBrut / tokensBuyer) * TOKEN_DECIMALS
    : 0;

  // Price impact: (P_after - P_before) / P_before
  const pBefore = x / y;
  const pAfter = xNew / yNew;
  const priceImpact = pBefore > 0 ? ((pAfter - pBefore) / pBefore) * 100 : 0;

  return {
    tokensBuyer,
    tokensCreator,
    tokensProtocol,
    tokensTotal,
    effectivePrice,
    feeTotal,
    priceImpact,
  };
}

/**
 * Estimate the result of a sell for a given token amount.
 * Mirrors the on-chain calculate_sell() logic.
 * @param x - Current x reserve (lamports)
 * @param y - Current y reserve (base units)
 * @param k - Current k invariant
 * @param tokenAmount - Tokens to sell (base units)
 */
export function estimateSell(
  x: number,
  y: number,
  k: number,
  tokenAmount: number
): SellEstimate {
  // Step 1: Tokens return to y
  const yNew = y + tokenAmount;

  // Step 2: Calculate gross SOL
  const xAfter = k / yNew;
  const solGross = x - xAfter;

  // Step 3: Fees (6%)
  const feeTotal = Math.ceil(solGross * TOTAL_FEE_BPS / BPS_DENOMINATOR);
  const solNet = solGross - feeTotal;

  // Price impact
  const pBefore = x / y;
  const feeDepth = Math.ceil(solGross * FEE_DEPTH_BPS / BPS_DENOMINATOR);
  const xFinal = x - solGross + feeDepth;
  const pAfter = xFinal / yNew;
  const priceImpact = pBefore > 0 ? ((pBefore - pAfter) / pBefore) * 100 : 0;

  return {
    solGross,
    solNet,
    feeTotal,
    priceImpact,
  };
}

/**
 * Calculate the market cap in lamports.
 * MC = P × S_tot = (x/y) × (supply_public + supply_creator + supply_protocol)
 */
export function marketCapLamports(
  x: number,
  y: number,
  supplyPublic: number,
  supplyCreator: number,
  supplyProtocol: number = 0
): number {
  if (y === 0) return 0;
  return (x * (supplyPublic + supplyCreator + supplyProtocol)) / y;
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
 * Format SOL amount for display.
 * @param sol - Amount in SOL
 * @returns Formatted string like "1.234 SOL"
 */
export function formatSol(sol: number): string {
  if (sol >= 1) return sol.toFixed(3) + " SOL";
  if (sol >= 0.001) return sol.toFixed(4) + " SOL";
  return sol.toFixed(6) + " SOL";
}
