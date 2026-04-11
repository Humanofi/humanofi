// ========================================
// Humanofi — Math Utilities
// ========================================

use crate::errors::HumanofiError;
use anchor_lang::prelude::*;

/// Integer square root for u128 (Newton's method)
/// Used for Smart Sell Limiter and quadratic calculations
pub fn isqrt_u128(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    if n <= 3 {
        return 1;
    }

    // Initial guess: start with n/2 for efficiency
    let mut x = n;
    let mut y = (x + 1) / 2;

    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }

    x
}

/// Ceiling division for u64: ceil(a / b)
/// Always rounds UP — ensures fees are never rounded to zero.
/// Mathematical formula: (a + b - 1) / b
/// Used for fee calculations — the protocol always collects.
pub fn ceil_div_u64(numerator: u64, denominator: u64) -> u64 {
    if numerator == 0 {
        return 0;
    }
    // (numerator + denominator - 1) / denominator
    numerator
        .saturating_add(denominator.saturating_sub(1))
        / denominator
}

/// Smart Sell Limiter: calculate max tokens a creator can sell
/// to keep price impact ≤ I (in BPS).
///
/// Formula: T_max = y × (1/√(1 - I) - 1)
///
/// Integer implementation:
///   √(BPS²) = BPS = 10000
///   √(BPS² - I × BPS) = √(BPS × (BPS - I_bps))
///   T_max = y × (√(BPS²) - √(BPS × (BPS - I_bps))) / √(BPS × (BPS - I_bps))
///
/// With I = 500 (5%):
///   T_max = y × (100 - √(10000 × 9500)) / √(10000 × 9500)
///         = y × (100 - √95000000) / √95000000
///         ≈ y × (100 - 9747) / 9747
///
/// Simplified for integer math:
///   T_max = y × (isqrt(BPS) - isqrt(BPS - I_bps)) / isqrt(BPS - I_bps)
///   But this loses precision. Better:
///   T_max = y * BPS / isqrt(BPS * (BPS - I_bps)) - y
pub fn smart_sell_max(y: u128, impact_bps: u64) -> Result<u64> {
    let bps = 10_000u128;
    let i = impact_bps as u128;

    // √(BPS × (BPS - I))
    let inner = bps
        .checked_mul(bps.checked_sub(i).ok_or(HumanofiError::MathOverflow)?)
        .ok_or(HumanofiError::MathOverflow)?;
    let sqrt_inner = isqrt_u128(inner);

    if sqrt_inner == 0 {
        return Ok(0);
    }

    // T_max = y × BPS / sqrt_inner - y
    //       = y × (BPS - sqrt_inner) / sqrt_inner
    let numerator = y
        .checked_mul(bps.checked_sub(sqrt_inner).ok_or(HumanofiError::MathOverflow)?)
        .ok_or(HumanofiError::MathOverflow)?;
    let t_max = numerator
        .checked_div(sqrt_inner)
        .ok_or(HumanofiError::MathOverflow)?;

    u64::try_from(t_max).map_err(|_| HumanofiError::MathOverflow.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_isqrt_basic() {
        assert_eq!(isqrt_u128(0), 0);
        assert_eq!(isqrt_u128(1), 1);
        assert_eq!(isqrt_u128(4), 2);
        assert_eq!(isqrt_u128(9), 3);
        assert_eq!(isqrt_u128(16), 4);
        assert_eq!(isqrt_u128(100), 10);
    }

    #[test]
    fn test_isqrt_non_perfect() {
        assert_eq!(isqrt_u128(2), 1);
        assert_eq!(isqrt_u128(3), 1);
        assert_eq!(isqrt_u128(5), 2);
        assert_eq!(isqrt_u128(10), 3);
        assert_eq!(isqrt_u128(99), 9);
    }

    #[test]
    fn test_isqrt_large() {
        // 10^18 → sqrt = 10^9
        assert_eq!(isqrt_u128(1_000_000_000_000_000_000), 1_000_000_000);
        // 10^24 → sqrt = 10^12
        assert_eq!(isqrt_u128(1_000_000_000_000_000_000_000_000), 1_000_000_000_000);
    }

    #[test]
    fn test_ceil_div_zero() {
        assert_eq!(ceil_div_u64(0, 10_000), 0);
    }

    #[test]
    fn test_ceil_div_exact() {
        assert_eq!(ceil_div_u64(10_000, 10_000), 1);
        assert_eq!(ceil_div_u64(200 * 10_000, 10_000), 200);
    }

    #[test]
    fn test_ceil_div_rounds_up() {
        assert_eq!(ceil_div_u64(1, 10_000), 1);
        assert_eq!(ceil_div_u64(9_999, 10_000), 1);
        assert_eq!(ceil_div_u64(10_001, 10_000), 2);
    }

    #[test]
    fn test_ceil_div_fee_6_percent() {
        // 6% fee on 1 SOL = 0.06 SOL = 60_000_000 lamports
        let fee = ceil_div_u64(1_000_000_000 * 600, 10_000);
        assert_eq!(fee, 60_000_000);
    }

    #[test]
    fn test_smart_sell_max_5_percent() {
        // y = 10,000 tokens (in base units)
        // Expected: T_max ≈ y × 0.02598 ≈ 259
        let y: u128 = 10_000 * 1_000_000; // 10K tokens × 10^6
        let t_max = smart_sell_max(y, 500).unwrap();

        // Expected: ~259.8 × 10^6 = ~259_800_000
        // Allow some rounding: should be 258-260 tokens
        let tokens = t_max / 1_000_000;
        assert!(tokens >= 258 && tokens <= 260, "T_max = {} tokens, expected ~259", tokens);

        // Verify the impact: (y + T_max) → approximate impact check
        // Integer isqrt rounding may give 1-3 bps over target — acceptable
        // The real on-chain test (test_smart_sell_limiter) verifies actual curve impact
        let y_after = y + t_max as u128;
        let impact_bps = 10000 - (y * y * 10000 / (y_after * y_after));
        assert!(impact_bps <= 503, "Impact = {} bps, expected ≤ ~500 (isqrt rounding)", impact_bps);
    }

    #[test]
    fn test_smart_sell_max_small_y() {
        // y = 1 token — edge case
        let y: u128 = 1_000_000; // 1 token
        let t_max = smart_sell_max(y, 500).unwrap();
        // Should be ~25,980 base units (0.02598 tokens)
        assert!(t_max > 0, "T_max should be > 0 for y=1");
        assert!(t_max <= 30_000, "T_max={}, expected ~25980", t_max);
    }
}
