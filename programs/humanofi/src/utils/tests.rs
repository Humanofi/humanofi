// ========================================
// Humanofi — Bonding Curve Math Simulation Tests
// ========================================
// Verifies that calculate_tokens_from_sol is mathematically exact:
// For any SOL input, the result satisfies:
//   calculate_buy_cost(tokens) <= sol_amount < calculate_buy_cost(tokens + 1)

#[cfg(test)]
mod bonding_curve_math_tests {
    use crate::constants::CURVE_PRECISION;
    use crate::state::BondingCurve;

    fn make_curve(base_price: u64, slope: u64, supply_sold: u64, sol_reserve: u64) -> BondingCurve {
        BondingCurve {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            base_price,
            slope,
            supply_sold,
            sol_reserve,
            created_at: 0,
            is_active: true,
            bump: 0,
        }
    }

    /// The invariant that MUST hold for every buy:
    /// cost(tokens) <= sol_amount < cost(tokens + 1)
    fn verify_invariant(curve: &BondingCurve, sol_amount: u64) {
        let tokens = curve.calculate_tokens_from_sol(sol_amount).unwrap();
        
        if tokens == 0 {
            // If 0 tokens, verify that even 1 token costs more than sol_amount
            if sol_amount > 0 {
                let cost_1 = curve.calculate_buy_cost(1).unwrap();
                assert!(
                    cost_1 > sol_amount,
                    "Bug: 0 tokens returned but 1 token only costs {} (budget={})",
                    cost_1, sol_amount
                );
            }
            return;
        }

        let actual_cost = curve.calculate_buy_cost(tokens).unwrap();
        assert!(
            actual_cost <= sol_amount,
            "OVERSHOOT: cost({})={} > budget={}",
            tokens, actual_cost, sol_amount
        );

        let cost_plus_one = curve.calculate_buy_cost(tokens + 1).unwrap();
        assert!(
            cost_plus_one > sol_amount,
            "UNDER-FILL: cost({})={} <= budget={}, should have gotten 1 more token",
            tokens + 1, cost_plus_one, sol_amount
        );
    }

    // ── Test 1: Small purchases at zero supply ──
    #[test]
    fn test_small_buy_zero_supply() {
        let curve = make_curve(1_000, 100, 0, 0); // base=1000 lamports, slope=100
        for sol in [1_000u64, 5_000, 10_000, 50_000, 100_000, 1_000_000] {
            verify_invariant(&curve, sol);
        }
    }

    // ── Test 2: Large purchases at zero supply ──
    #[test]
    fn test_large_buy_zero_supply() {
        let curve = make_curve(1_000, 100, 0, 0);
        for sol in [1_000_000_000u64, 5_000_000_000, 10_000_000_000] {
            verify_invariant(&curve, sol);
        }
    }

    // ── Test 3: Purchases at high supply (price is high) ──
    #[test]
    fn test_buy_high_supply() {
        let curve = make_curve(1_000, 100, 50_000_000_000, 10_000_000_000);
        for sol in [100_000u64, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000] {
            verify_invariant(&curve, sol);
        }
    }

    // ── Test 4: Edge case — minimum buy (1 lamport) ──
    #[test]
    fn test_minimum_buy() {
        let curve = make_curve(1_000, 100, 0, 0);
        verify_invariant(&curve, 1);
    }

    // ── Test 5: Typical Humanofi params ──
    #[test]
    fn test_realistic_humanofi_params() {
        // Typical: base_price=100_000 (0.0001 SOL), slope=10
        let curve = make_curve(100_000, 10, 0, 0);
        
        // Various buy amounts from 0.001 SOL to 10 SOL
        for sol in [
            1_000_000u64,       // 0.001 SOL
            10_000_000,         // 0.01 SOL
            100_000_000,        // 0.1 SOL
            1_000_000_000,      // 1 SOL
            5_000_000_000,      // 5 SOL
            10_000_000_000,     // 10 SOL
        ] {
            verify_invariant(&curve, sol);
        }
    }

    // ── Test 6: Sequential buys (supply increases each time) ──
    #[test]
    fn test_sequential_buys() {
        let mut curve = make_curve(100_000, 10, 0, 0);
        
        for _ in 0..10 {
            let sol = 1_000_000_000; // 1 SOL each time
            let tokens = curve.calculate_tokens_from_sol(sol).unwrap();
            let cost = curve.calculate_buy_cost(tokens).unwrap();
            
            assert!(cost <= sol, "Cost {} exceeds budget {}", cost, sol);
            assert!(tokens > 0, "Should get at least 1 token");
            
            // Simulate the buy
            curve.supply_sold += tokens;
            curve.sol_reserve += cost;
        }
    }

    // ── Test 7: Buy-sell roundtrip balance ──
    #[test]
    fn test_buy_sell_reserve_balance() {
        let mut curve = make_curve(100_000, 10, 0, 30_000_000); // 0.03 SOL initial
        
        // Buy 1 SOL worth
        let sol_in = 1_000_000_000u64;
        let tokens = curve.calculate_tokens_from_sol(sol_in).unwrap();
        let buy_cost = curve.calculate_buy_cost(tokens).unwrap();
        
        curve.supply_sold += tokens;
        curve.sol_reserve += buy_cost;
        
        // Sell all tokens back
        let sell_return = curve.calculate_sell_return(tokens).unwrap();
        
        // Sell return should never exceed what was deposited
        assert!(
            sell_return <= buy_cost,
            "Sell return {} exceeds buy cost {} — reserve drain!",
            sell_return, buy_cost
        );
        
        // But should be close (within rounding)
        let diff = buy_cost - sell_return;
        assert!(
            diff <= 1, // At most 1 lamport rounding
            "Buy-sell difference {} is too large (buy={}, sell={})",
            diff, buy_cost, sell_return
        );
    }

    // ── Test 8: Flat price (slope = 0) ──
    #[test]
    fn test_flat_price_curve() {
        let curve = make_curve(50_000, 0, 0, 0); // Fixed 50k lamports per token
        
        let tokens = curve.calculate_tokens_from_sol(1_000_000_000).unwrap();
        // 1 SOL / 50k per token = 20,000 tokens (with 6 decimals = 20,000,000,000)
        assert_eq!(tokens, 20_000_000_000);
    }

    // ── Test 9: Extreme values (stress test) ──
    #[test]
    fn test_extreme_values() {
        // Very high slope = very steep curve
        let curve = make_curve(1_000_000, 1_000_000, 0, 0);
        verify_invariant(&curve, 10_000_000_000); // 10 SOL
        
        // Very low base price
        let curve2 = make_curve(1, 1, 0, 0);
        verify_invariant(&curve2, 1_000_000); // 0.001 SOL
    }

    // ── Test 10: Fuzz-like sweep across many amounts ──
    #[test]
    fn test_fuzz_sweep() {
        let curve = make_curve(100_000, 50, 1_000_000_000, 500_000_000);
        
        // Test 100 different amounts logarithmically spaced
        let mut sol = 1_000u64;
        for _ in 0..20 {
            verify_invariant(&curve, sol);
            sol = sol.saturating_mul(3); // ~3x each iteration
            if sol > 50_000_000_000 { break; } // Cap at 50 SOL
        }
    }
}
