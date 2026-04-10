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
}
