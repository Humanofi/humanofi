// ========================================
// Humanofi — Price Formatting Utilities
// ========================================

/**
 * Convert SOL amount (in lamports) to USD using oracle price.
 * @param lamports - Amount in lamports (1 SOL = 1,000,000,000 lamports)
 * @param solPriceUsd - Current SOL/USD price from oracle
 * @returns USD value
 */
export function lamportsToUsd(lamports: number, solPriceUsd: number): number {
  return (lamports / 1_000_000_000) * solPriceUsd;
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
