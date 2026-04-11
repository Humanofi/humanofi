// ========================================
// Humanofi — Math Utilities
// ========================================

/// Integer square root for u128 (Newton's method)
/// Used for exact token calculation from SOL via quadratic formula
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
        // 10000 / 10000 = 1 exactly
        assert_eq!(ceil_div_u64(10_000, 10_000), 1);
        // 200 * 10_000 / 10_000 = 200
        assert_eq!(ceil_div_u64(200 * 10_000, 10_000), 200);
    }

    #[test]
    fn test_ceil_div_rounds_up() {
        // 1 / 10000 → floor=0, ceil=1
        assert_eq!(ceil_div_u64(1, 10_000), 1);
        // 9999 / 10000 → floor=0, ceil=1
        assert_eq!(ceil_div_u64(9_999, 10_000), 1);
        // 10001 / 10000 → floor=1, ceil=2
        assert_eq!(ceil_div_u64(10_001, 10_000), 2);
    }

    #[test]
    fn test_ceil_div_fee_never_zero() {
        // Simulates: fee = ceil(sol_amount * 200 / 10000) for small amounts
        // 1 lamport → fee = ceil(200/10000) = ceil(0.02) = 1
        let fee_1 = ceil_div_u64(1 * 200, 10_000);
        assert_eq!(fee_1, 1); // NOT zero!

        // 49 lamports → fee = ceil(9800/10000) = ceil(0.98) = 1
        let fee_49 = ceil_div_u64(49 * 200, 10_000);
        assert_eq!(fee_49, 1); // NOT zero!

        // 50 lamports → fee = ceil(10000/10000) = 1 exactly
        let fee_50 = ceil_div_u64(50 * 200, 10_000);
        assert_eq!(fee_50, 1);

        // 500 lamports → fee = ceil(100000/10000) = 10
        let fee_500 = ceil_div_u64(500 * 200, 10_000);
        assert_eq!(fee_500, 10);
    }

    #[test]
    fn test_ceil_div_realistic_5_dollar_buy() {
        // $5 ≈ 0.035 SOL = 35_000_000 lamports
        // fee = ceil(35_000_000 * 200 / 10_000) = ceil(700_000) = 700_000
        let fee = ceil_div_u64(35_000_000 * 200, 10_000);
        assert_eq!(fee, 700_000); // 0.0007 SOL fee — correct!
    }
}
