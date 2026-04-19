// ========================================
// Humanofi — Country Flag Utility
// ========================================
// Converts a 2-letter ISO country code to its flag emoji.
// Uses Unicode Regional Indicator Symbols (no library needed).
// "FR" → 🇫🇷, "US" → 🇺🇸, "JP" → 🇯🇵

/**
 * Convert a 2-letter ISO 3166-1 alpha-2 country code to a flag emoji.
 * Returns empty string if code is invalid.
 */
export function countryToFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return "";
  const code = countryCode.toUpperCase();
  // Each letter is converted to its Regional Indicator Symbol
  // 'A' = 65, Regional Indicator 'A' = 0x1F1E6
  const first = code.codePointAt(0)! - 65 + 0x1F1E6;
  const second = code.codePointAt(1)! - 65 + 0x1F1E6;
  return String.fromCodePoint(first, second);
}
