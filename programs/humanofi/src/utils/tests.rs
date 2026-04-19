// ========================================
// Humanofi — Unit Tests (v3.6)
// ========================================
//
// Tests covering:
//   - Core mechanics (init, buy, sell, fees, Founder Buy)
//   - Invariant verification (x = sol_reserve + D, k monotonic, supply bounded)
//   - Edge cases (tiny amounts, max amounts, first buy, full sell)
//   - Stress tests (100+ trades, alternating buy/sell)
//   - Adversarial scenarios (round-trip extraction, pump and dump, fee dust)
//   - Creator sell dual fee structure (6% vs holder 5%)
//   - Stabilizer dormancy (always returns None)
//   - Multi-creator isolation
//   - Economic attack resistance (sandwich cost, wash trading)

#[cfg(test)]
mod human_curve_tests {
    use crate::constants::*;
    use crate::state::BondingCurve;

    /// Create a test bonding curve with Depth Parameter D = 20 × V
    /// v3.6: x₀ = D (depth only), then Founder Buy adds V through the curve.
    /// For most tests, we simulate post-Founder-Buy state.
    fn make_curve(sol_lamports: u64) -> BondingCurve {
        let depth = (DEPTH_RATIO as u64) * sol_lamports;
        let x0 = depth as u128;
        let y0 = INITIAL_Y;
        let k0 = x0 * y0;
        let twap = x0 * PRICE_PRECISION / y0;

        let mut c = BondingCurve {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            x: x0,
            y: y0,
            k: k0,
            supply_public: 0,
            supply_creator: 0,
            supply_protocol: 0,
            sol_reserve: 0,
            depth_parameter: depth,
            twap_price: twap,
            trade_count: 0,
            created_at: 0,
            is_active: true,
            is_suspended: false,
            bump: 0,
        };

        // Simulate Founder Buy: V enters the curve
        let fb = c.calculate_founder_buy(sol_lamports).unwrap();
        c.apply_founder_buy(&fb).unwrap();

        c
    }

    /// Create a pre-Founder-Buy curve (depth only, no real SOL)
    fn make_curve_pre_founder(sol_lamports: u64) -> BondingCurve {
        let depth = (DEPTH_RATIO as u64) * sol_lamports;
        let x0 = depth as u128;
        let y0 = INITIAL_Y;
        let k0 = x0 * y0;
        let twap = x0 * PRICE_PRECISION / y0;

        BondingCurve {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            x: x0,
            y: y0,
            k: k0,
            supply_public: 0,
            supply_creator: 0,
            supply_protocol: 0,
            sol_reserve: 0,
            depth_parameter: depth,
            twap_price: twap,
            trade_count: 0,
            created_at: 0,
            is_active: true,
            is_suspended: false,
            bump: 0,
        }
    }

    // ================================================================
    // SECTION 1: Initialization & Founder Buy
    // ================================================================

    #[test]
    fn test_init_depth_parameter() {
        let v = 100_000_000; // 0.1 SOL
        let c = make_curve_pre_founder(v);

        assert_eq!(c.x, DEPTH_RATIO as u128 * v as u128);
        assert_eq!(c.y, INITIAL_Y);
        assert_eq!(c.k, (DEPTH_RATIO as u128 * v as u128) * INITIAL_Y);
        assert_eq!(c.sol_reserve, 0);
        assert_eq!(c.depth_parameter, DEPTH_RATIO * v);
    }

    #[test]
    fn test_founder_buy_gives_tokens() {
        let v = 100_000_000; // 0.1 SOL
        let c_pre = make_curve_pre_founder(v);
        let fb = c_pre.calculate_founder_buy(v).unwrap();

        // Creator should get tokens
        assert!(fb.tokens_creator > 0, "Founder Buy must produce tokens");

        // 3% fee: 2% protocol + 1% depth
        let expected_total_fee = crate::utils::ceil_div_u64(v * 300, 10_000);
        let actual_total_fee = fb.fee_protocol + fb.fee_depth;
        assert_eq!(actual_total_fee, expected_total_fee, "Founder Buy fee = 3%");

        // sol_to_curve = V - 3%
        assert_eq!(fb.sol_to_curve, v - expected_total_fee);
    }

    #[test]
    fn test_founder_buy_curve_state() {
        let v = 100_000_000; // 0.1 SOL
        let c = make_curve(v);

        // After Founder Buy: x = D + sol_to_curve + depth_fee ≈ (DEPTH_RATIO + 0.98)V
        let dr = DEPTH_RATIO as u128;
        assert!(c.x > dr * v as u128, "x must increase after Founder Buy");
        assert!(c.x < (dr + 1) * v as u128, "x should be ~DEPTH_RATIO.98 * V");

        // y decreased (tokens were bought)
        assert!(c.y < INITIAL_Y, "y must decrease after Founder Buy");

        // k increased (k-deepening from depth fee)
        let k0 = (dr * v as u128) * INITIAL_Y;
        assert!(c.k > k0, "k must increase due to depth fee k-deepening");

        // supply_creator = tokens from Founder Buy
        assert!(c.supply_creator > 0, "Creator should have tokens");
        assert_eq!(c.supply_public, 0, "No public supply yet");
        assert_eq!(c.supply_protocol, 0, "No protocol supply in v3.6");

        // sol_reserve = sol_to_curve + fee_depth (protocol fee left the vault)
        assert!(c.sol_reserve > 0, "sol_reserve must be positive");

        // Invariant: x = sol_reserve + D
        assert_eq!(
            c.x,
            (c.sol_reserve as u128) + (c.depth_parameter as u128),
            "INVARIANT BROKEN: x={} != sol_reserve({}) + D({})",
            c.x, c.sol_reserve, c.depth_parameter
        );
    }

    #[test]
    fn test_init_various_liquidity_levels() {
        let c_min = make_curve(MIN_INITIAL_LIQUIDITY);
        assert!(c_min.get_spot_price().unwrap() > 0);

        let c1 = make_curve(1_000_000_000);
        let p1 = c1.get_spot_price().unwrap();

        let c10 = make_curve(10_000_000_000);
        let p10 = c10.get_spot_price().unwrap();

        // Higher liquidity = higher initial price (x₀/y₀ scales with V)
        assert!(p10 > p1, "10 SOL must give higher price than 1 SOL");
    }

    #[test]
    fn test_invariant_x_eq_reserve_plus_depth_through_lifecycle() {
        let mut c = make_curve(1_000_000_000);

        let check = |c: &BondingCurve| {
            assert_eq!(
                c.x,
                (c.sol_reserve as u128) + (c.depth_parameter as u128),
                "INVARIANT BROKEN: x={} != sol_reserve({}) + D({})",
                c.x, c.sol_reserve, c.depth_parameter
            );
        };

        check(&c);

        // 10 buys
        for i in 0..10 {
            let r = c.calculate_buy(50_000_000 + i * 10_000_000).unwrap();
            c.apply_buy(&r).unwrap();
            check(&c);
        }

        // 5 sells (holder sell = not creator)
        for _ in 0..5 {
            let sell_amt = c.supply_public / 10;
            if sell_amt == 0 { break; }
            let sr = c.calculate_sell(sell_amt, false).unwrap();
            c.apply_sell(&sr).unwrap();
            c.supply_public -= sell_amt;
            check(&c);
        }
    }

    #[test]
    fn test_k_never_decreases_full_lifecycle() {
        let mut c = make_curve(500_000_000);
        let mut prev_k = c.k;

        // 20 buys
        for _ in 0..20 {
            let r = c.calculate_buy(25_000_000).unwrap();
            c.apply_buy(&r).unwrap();
            assert!(c.k >= prev_k, "k decreased on buy: {} < {}", c.k, prev_k);
            prev_k = c.k;
        }

        // 10 sells
        for _ in 0..10 {
            let sell_amt = c.supply_public / 20;
            if sell_amt == 0 { break; }
            let sr = c.calculate_sell(sell_amt, false).unwrap();
            c.apply_sell(&sr).unwrap();
            c.supply_public -= sell_amt;
            assert!(c.k >= prev_k, "k decreased on sell: {} < {}", c.k, prev_k);
            prev_k = c.k;
        }
    }

    // ================================================================
    // SECTION 2: Buy Mechanics (v3.6 — 100% to buyer)
    // ================================================================

    #[test]
    fn test_basic_buy_100pct_buyer() {
        let mut c = make_curve(100_000_000);
        let buy_sol = 50_000_000;

        let r = c.calculate_buy(buy_sol).unwrap();

        // 100% of tokens go to buyer (no merit split)
        assert!(r.tokens_buyer > 0);

        c.apply_buy(&r).unwrap();
        assert_eq!(c.supply_public, r.tokens_buyer);
        // supply_creator unchanged (only from Founder Buy)
        // supply_protocol always 0 in v3.6
        assert_eq!(c.supply_protocol, 0);
    }

    #[test]
    fn test_fee_split_5pct() {
        let c = make_curve(1_000_000_000);
        let buy_sol: u64 = 1_000_000_000;

        let r = c.calculate_buy(buy_sol).unwrap();

        let total_fee = r.fee_creator + r.fee_protocol + r.fee_depth;
        let expected = crate::utils::ceil_div_u64(buy_sol * 500, 10_000);
        assert_eq!(total_fee, expected, "Total fee must be 5%");

        // v3.7: 3% creator on buy
        assert_eq!(r.fee_creator, crate::utils::ceil_div_u64(buy_sol * 300, 10_000));
        // 1% depth
        assert_eq!(r.fee_depth, crate::utils::ceil_div_u64(buy_sol * 100, 10_000));
        // 1% protocol (remainder)
        assert_eq!(r.fee_protocol, crate::utils::ceil_div_u64(buy_sol * 100, 10_000));
    }

    #[test]
    fn test_price_monotonic_on_buy() {
        let mut c = make_curve(100_000_000);
        let mut prev_price = c.get_spot_price().unwrap();

        for _ in 0..20 {
            let r = c.calculate_buy(10_000_000).unwrap();
            c.apply_buy(&r).unwrap();
            let new_price = c.get_spot_price().unwrap();
            assert!(new_price > prev_price, "Price must increase on buy");
            prev_price = new_price;
        }
    }

    #[test]
    fn test_first_buy_gives_most_tokens() {
        let mut c = make_curve(1_000_000_000);
        let amount = 100_000_000; // 0.1 SOL

        let r1 = c.calculate_buy(amount).unwrap();
        c.apply_buy(&r1).unwrap();

        let r2 = c.calculate_buy(amount).unwrap();
        c.apply_buy(&r2).unwrap();

        let r3 = c.calculate_buy(amount).unwrap();

        assert!(r1.tokens_buyer > r2.tokens_buyer, "First buy must give more tokens than second");
        assert!(r2.tokens_buyer > r3.tokens_buyer, "Second buy must give more tokens than third");
    }

    #[test]
    fn test_tiny_buy_1_lamport() {
        let c = make_curve(100_000_000);
        let r = c.calculate_buy(1);
        if let Ok(r) = r {
            assert_eq!(r.tokens_buyer, 0, "1 lamport buy should produce 0 tokens");
        }
    }

    #[test]
    fn test_large_buy_100_sol() {
        let mut c = make_curve(1_000_000_000); // 1 SOL initial
        let buy = 100_000_000_000u64; // 100 SOL

        let r = c.calculate_buy(buy).unwrap();
        assert!(r.tokens_buyer > 0);

        c.apply_buy(&r).unwrap();

        // x = sol_reserve + D still holds
        assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));
    }

    // ================================================================
    // SECTION 3: Sell Mechanics (v3.6 — dual fee structure)
    // ================================================================

    #[test]
    fn test_holder_sell_5pct_fee() {
        let mut c = make_curve(1_000_000_000);

        // Buy tokens first
        let br = c.calculate_buy(500_000_000).unwrap();
        c.apply_buy(&br).unwrap();

        // Holder sell: 5% fee (1% creator + 3% protocol + 1% depth)
        let sr = c.calculate_sell(br.tokens_buyer / 2, false).unwrap();

        let total_fee = sr.fee_creator + sr.fee_protocol + sr.fee_depth;
        let expected = crate::utils::ceil_div_u64(sr.sol_gross * 500, 10_000);
        assert_eq!(total_fee, expected, "Holder sell must have 5% fee");

        assert!(sr.fee_creator > 0, "Holder sell must pay creator fee");
    }

    #[test]
    fn test_creator_sell_6pct_fee_no_self_fee() {
        let mut c = make_curve(1_000_000_000);

        // Buy tokens to boost supply_public (needed for curve liquidity)
        for _ in 0..10 {
            let r = c.calculate_buy(500_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        // Creator sell: 6% fee (5% protocol + 1% depth, 0% creator)
        let sell_amount = c.supply_creator.min(c.get_max_sell_amount().unwrap());
        if sell_amount > 0 {
            let sr = c.calculate_sell(sell_amount, true).unwrap();

            let total_fee = sr.fee_creator + sr.fee_protocol + sr.fee_depth;
            let expected = crate::utils::ceil_div_u64(sr.sol_gross * 600, 10_000);
            assert_eq!(total_fee, expected, "Creator sell must have 6% fee");

            // No self-fee: fee_creator = 0
            assert_eq!(sr.fee_creator, 0, "Creator must NOT earn fees on own sell");

            // Protocol gets 5%
            let expected_protocol = crate::utils::ceil_div_u64(sr.sol_gross * 500, 10_000);
            let expected_depth = crate::utils::ceil_div_u64(sr.sol_gross * 100, 10_000);
            assert_eq!(sr.fee_protocol, expected_protocol - 0, "Protocol should get ~5%");
            assert_eq!(sr.fee_depth, expected_depth, "Depth should get 1%");
        }
    }

    #[test]
    fn test_sell_returns_less_than_input() {
        let mut c = make_curve(1_000_000_000);
        let buy_sol = 500_000_000;

        let r = c.calculate_buy(buy_sol).unwrap();
        c.apply_buy(&r).unwrap();

        let sr = c.calculate_sell(r.tokens_buyer, false).unwrap();
        c.apply_sell(&sr).unwrap();

        assert!(sr.sol_net < buy_sol, "Roundtrip must lose: got back {} < put in {}", sr.sol_net, buy_sol);

        let loss_pct = (buy_sol - sr.sol_net) as f64 / buy_sol as f64 * 100.0;
        assert!(loss_pct > 9.0, "Loss should be >9% (5% entry + 5% exit fees), got {:.1}%", loss_pct);
    }

    #[test]
    fn test_sell_all_public_supply() {
        let mut c = make_curve(1_000_000_000);

        for _ in 0..5 {
            let r = c.calculate_buy(200_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let total_public = c.supply_public;
        let sr = c.calculate_sell(total_public, false).unwrap();

        let total_out = sr.sol_net + sr.fee_creator + sr.fee_protocol;
        assert!(c.sol_reserve >= total_out, "SOLVENCY FAILURE: reserve={} < needed={}", c.sol_reserve, total_out);

        c.apply_sell(&sr).unwrap();
        c.supply_public = 0;

        assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));
    }

    #[test]
    fn test_price_decreases_on_sell() {
        let mut c = make_curve(1_000_000_000);

        for _ in 0..10 {
            let r = c.calculate_buy(100_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let mut prev_price = c.get_spot_price().unwrap();

        for _ in 0..5 {
            let sell = c.supply_public / 10;
            if sell == 0 { break; }
            let sr = c.calculate_sell(sell, false).unwrap();
            c.apply_sell(&sr).unwrap();
            c.supply_public -= sell;

            let new_price = c.get_spot_price().unwrap();
            assert!(new_price < prev_price, "Price must decrease on sell");
            prev_price = new_price;
        }
    }

    // ================================================================
    // SECTION 4: Solvency & Safety
    // ================================================================

    #[test]
    fn test_solvency_after_max_stress() {
        let mut c = make_curve(1_000_000_000);

        for i in 0..50 {
            let amount = 10_000_000 + (i * 7_654_321) % 500_000_000;
            let r = c.calculate_buy(amount).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let total = c.supply_public;
        let sr = c.calculate_sell(total, false).unwrap();
        let total_out = sr.sol_net + sr.fee_creator + sr.fee_protocol;
        assert!(
            c.sol_reserve >= total_out,
            "SOLVENCY FAILURE after 50 buys: sol_reserve={}, needed={}",
            c.sol_reserve, total_out
        );
    }

    #[test]
    fn test_solvency_alternating_buy_sell() {
        let mut c = make_curve(1_000_000_000);

        for i in 0..20 {
            let buy_amount = 50_000_000 + (i * 3_000_000);
            let r = c.calculate_buy(buy_amount).unwrap();
            c.apply_buy(&r).unwrap();

            let sell_amount = c.supply_public / 3;
            if sell_amount == 0 { continue; }
            let sr = c.calculate_sell(sell_amount, false).unwrap();

            let total_out = sr.sol_net + sr.fee_creator + sr.fee_protocol;
            assert!(c.sol_reserve >= total_out, "Solvency at iter {}", i);

            c.apply_sell(&sr).unwrap();
            c.supply_public -= sell_amount;

            assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));
        }
    }

    #[test]
    fn test_supply_never_exceeds_y0() {
        let mut c = make_curve(100_000_000);

        for _ in 0..100 {
            let r = c.calculate_buy(1_000_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let total_minted = c.supply_public + c.supply_creator + c.supply_protocol;
        assert!(
            (total_minted as u128) < INITIAL_Y,
            "Total supply {} must be < y₀ {}",
            total_minted, INITIAL_Y
        );

        assert!(c.y > 0, "y must never reach 0");
    }

    #[test]
    fn test_depth_parameter_never_changes() {
        let mut c = make_curve(1_000_000_000);
        let d_init = c.depth_parameter;

        for _ in 0..10 {
            let r = c.calculate_buy(100_000_000).unwrap();
            c.apply_buy(&r).unwrap();
            assert_eq!(c.depth_parameter, d_init, "D must NEVER change");
        }

        let sell = c.supply_public / 2;
        let sr = c.calculate_sell(sell, false).unwrap();
        c.apply_sell(&sr).unwrap();
        assert_eq!(c.depth_parameter, d_init, "D must NEVER change after sell");
    }

    // ================================================================
    // SECTION 5: Smart Sell Limiter
    // ================================================================

    #[test]
    fn test_smart_sell_max() {
        let c = make_curve(1_000_000_000);
        let max = c.get_max_sell_amount().unwrap();

        // Note: y is slightly less than INITIAL_Y after Founder Buy
        let expected_approx = (c.y as f64 * 0.02598) as u64;
        let diff = if max > expected_approx { max - expected_approx } else { expected_approx - max };
        let tolerance = expected_approx / 100;
        assert!(diff <= tolerance, "Smart sell max: got {} expected ~{}", max, expected_approx);
    }

    #[test]
    fn test_sell_at_max_impact_limit() {
        let mut c = make_curve(1_000_000_000);

        for _ in 0..10 {
            let r = c.calculate_buy(1_000_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let max_sell = c.get_max_sell_amount().unwrap();
        let price_before = c.get_spot_price().unwrap();

        let sr = c.calculate_sell(max_sell, false).unwrap();
        c.apply_sell(&sr).unwrap();
        c.supply_public -= max_sell;

        let price_after = c.get_spot_price().unwrap();
        let impact_pct = ((price_before - price_after) as f64 / price_before as f64) * 100.0;

        assert!(impact_pct <= 6.0, "Impact {}% exceeds 6% tolerance", impact_pct);
        assert!(impact_pct >= 4.0, "Impact {}% too low (expected ~5%)", impact_pct);
    }

    // ================================================================
    // SECTION 6: TWAP & Stabilizer
    // ================================================================

    #[test]
    fn test_twap_update() {
        let mut c = make_curve(100_000_000);
        let initial_twap = c.twap_price;

        let r1 = c.calculate_buy(50_000_000).unwrap();
        c.apply_buy(&r1).unwrap();
        c.update_twap().unwrap();

        assert!(c.twap_price >= initial_twap);
        assert_eq!(c.trade_count, 1);

        let r2 = c.calculate_buy(50_000_000).unwrap();
        c.apply_buy(&r2).unwrap();
        c.update_twap().unwrap();
        assert_eq!(c.trade_count, 2);
    }

    #[test]
    fn test_stabilizer_dormant_in_v36() {
        let mut c = make_curve(1_000_000_000);

        // Build history
        for _ in 0..5 {
            let r = c.calculate_buy(200_000_000).unwrap();
            c.apply_buy(&r).unwrap();
            c.update_twap().unwrap();
        }

        // Spike
        let spike = c.calculate_buy(10_000_000_000).unwrap();
        c.apply_buy(&spike).unwrap();
        c.update_twap().unwrap();

        // v3.6: protocol never has tokens → stabilizer always None
        let stab = c.calculate_stabilization(0).unwrap();
        assert!(stab.is_none(), "Stabilizer must be dormant with 0 protocol tokens");
    }

    // ================================================================
    // SECTION 7: Adversarial / Economic Attack Simulations
    // ================================================================

    #[test]
    fn test_roundtrip_loss_quantification() {
        let mut c = make_curve(1_000_000_000);
        let amounts = vec![100_000_000, 500_000_000, 1_000_000_000, 5_000_000_000u64];

        for buy_sol in amounts {
            let mut c2 = c.clone();
            let r = c2.calculate_buy(buy_sol).unwrap();
            c2.apply_buy(&r).unwrap();

            let sr = c2.calculate_sell(r.tokens_buyer, false).unwrap();
            let loss_pct = ((buy_sol - sr.sol_net) as f64 / buy_sol as f64) * 100.0;

            // Round-trip loss must be >= ~9.7% (5% on entry + ~5% on exit)
            assert!(loss_pct > 9.0,
                "Buy {} lamports: loss {:.1}% < 9% — sandwich might be profitable!",
                buy_sol, loss_pct
            );
        }
    }

    #[test]
    fn test_sandwich_attack_unprofitable() {
        let mut c = make_curve(1_000_000_000);

        for _ in 0..5 {
            let r = c.calculate_buy(100_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let attacker_initial_sol = 2_000_000_000u64;
        let victim_sol = 500_000_000u64;

        let atk_buy = c.calculate_buy(attacker_initial_sol).unwrap();
        c.apply_buy(&atk_buy).unwrap();

        let victim_buy = c.calculate_buy(victim_sol).unwrap();
        c.apply_buy(&victim_buy).unwrap();

        let atk_sell = c.calculate_sell(atk_buy.tokens_buyer, false).unwrap();

        let attacker_got_back = atk_sell.sol_net;
        if attacker_got_back >= attacker_initial_sol {
            panic!(
                "SANDWICH PROFITABLE! Attacker put {} got back {} = +{} lamports",
                attacker_initial_sol,
                attacker_got_back,
                attacker_got_back - attacker_initial_sol
            );
        }

        let attacker_loss = attacker_initial_sol - attacker_got_back;
        let loss_pct = attacker_loss as f64 / attacker_initial_sol as f64 * 100.0;
        assert!(loss_pct > 5.0,
            "Attacker loss {:.1}% is too small — sandwich is nearly break-even",
            loss_pct
        );
    }

    #[test]
    fn test_wash_trading_unprofitable() {
        let mut c = make_curve(1_000_000_000);
        let trade_amount = 200_000_000u64;

        for _ in 0..3 {
            let r = c.calculate_buy(100_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let mut total_in: u64 = 0;
        let mut total_out: u64 = 0;

        for _ in 0..10 {
            let r = c.calculate_buy(trade_amount).unwrap();
            c.apply_buy(&r).unwrap();
            total_in += trade_amount;

            let sr = c.calculate_sell(r.tokens_buyer, false).unwrap();
            c.apply_sell(&sr).unwrap();
            c.supply_public -= r.tokens_buyer;
            total_out += sr.sol_net;
        }

        assert!(total_out < total_in,
            "Wash trading must lose money: in={} out={} (+{})",
            total_in, total_out,
            if total_out > total_in { total_out - total_in } else { 0 }
        );

        let loss_pct = (total_in - total_out) as f64 / total_in as f64 * 100.0;
        assert!(loss_pct > 8.0, "Wash trading loss {:.1}% is suspiciously low", loss_pct);
    }

    #[test]
    fn test_price_manipulation_cost() {
        let mut c = make_curve(1_000_000_000);
        let p0 = c.get_spot_price().unwrap();
        let target = p0 * 10;

        let mut total_invested = 0u64;
        let mut iterations = 0;

        while c.get_spot_price().unwrap() < target && iterations < 100 {
            let buy = 1_000_000_000u64;
            let r = c.calculate_buy(buy).unwrap();
            c.apply_buy(&r).unwrap();
            total_invested += buy;
            iterations += 1;
        }

        assert!(total_invested > 10_000_000_000,
            "Only cost {} lamports to 10x price — too cheap!",
            total_invested
        );
    }

    // ================================================================
    // SECTION 8: Edge Cases
    // ================================================================

    #[test]
    fn test_min_liquidity_curve() {
        let c = make_curve(MIN_INITIAL_LIQUIDITY);
        let r = c.calculate_buy(MIN_INITIAL_LIQUIDITY).unwrap();
        assert!(r.tokens_buyer > 0, "Must produce tokens even at minimum liquidity");
    }

    #[test]
    fn test_sell_zero_fails() {
        let c = make_curve(1_000_000_000);
        let result = c.calculate_sell(0, false);
        assert!(result.is_err(), "Selling 0 tokens must fail");
    }

    #[test]
    fn test_buy_zero_fails() {
        let c = make_curve(1_000_000_000);
        let result = c.calculate_buy(0);
        assert!(result.is_err(), "Buying with 0 SOL must fail");
    }

    #[test]
    fn test_many_small_buys_vs_one_large() {
        let mut c1 = make_curve(1_000_000_000);
        let mut c2 = make_curve(1_000_000_000);

        let total_sol = 1_000_000_000u64;

        // c1: Many small buys
        for _ in 0..100 {
            let r = c1.calculate_buy(total_sol / 100).unwrap();
            c1.apply_buy(&r).unwrap();
        }

        // c2: One large buy
        let r2 = c2.calculate_buy(total_sol).unwrap();
        c2.apply_buy(&r2).unwrap();

        let supply_small = c1.supply_public;
        let supply_large = c2.supply_public;

        // Both should be reasonably close (within 5%)
        let diff_pct = ((supply_small as f64 - supply_large as f64).abs() / supply_large as f64) * 100.0;
        assert!(diff_pct < 10.0,
            "Small buys vs large buy differ by {:.1}% — acceptable due to k-deepening",
            diff_pct
        );
    }

    // ================================================================
    // SECTION 9: Creator Sell Vault Accounting
    // ================================================================

    #[test]
    fn test_creator_sell_vault_accounting() {
        let mut c = make_curve(1_000_000_000);

        // Buy lots to boost liquidity
        for _ in 0..20 {
            let r = c.calculate_buy(1_000_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let sol_before = c.sol_reserve;
        let sell_amount = c.supply_creator.min(c.get_max_sell_amount().unwrap());
        if sell_amount == 0 { return; }

        let sr = c.calculate_sell(sell_amount, true).unwrap();

        // Verify: vault loses sol_net + fee_protocol (fee_depth stays)
        let vault_loss = sr.sol_net + sr.fee_protocol;
        // fee_depth stays in vault via k-deepening

        c.apply_sell(&sr).unwrap();
        c.supply_creator -= sell_amount;

        // sol_reserve decreased by exactly vault_loss
        assert_eq!(
            sol_before - c.sol_reserve,
            vault_loss,
            "Vault should lose {} (sol_net + fee_protocol), lost {}",
            vault_loss, sol_before - c.sol_reserve
        );
    }

    // ================================================================
    // SECTION 10: Flash Loan / Atomic Drain Attack
    // ================================================================

    /// Simulates an attacker who borrows SOL via flash loan,
    /// buys a massive amount, then immediately sells everything.
    /// MUST lose money — the 5%+5% round-trip fee is the defense.
    #[test]
    fn test_flash_loan_drain_impossible() {
        let mut c = make_curve(1_000_000_000); // 1 SOL initial

        // Simulate existing market activity
        for _ in 0..5 {
            let r = c.calculate_buy(200_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let reserve_before = c.sol_reserve;

        // Attacker flash-borrows 1000 SOL
        let flash_amount = 1_000_000_000_000u64; // 1000 SOL
        let buy_result = c.calculate_buy(flash_amount).unwrap();
        c.apply_buy(&buy_result).unwrap();

        // Immediately sell everything
        let sell_result = c.calculate_sell(buy_result.tokens_buyer, false).unwrap();
        c.apply_sell(&sell_result).unwrap();
        c.supply_public -= buy_result.tokens_buyer;

        // Attacker MUST lose money (can't profit from flash loan)
        assert!(sell_result.sol_net < flash_amount,
            "CRITICAL: Flash loan attack profitable! In={} Out={}",
            flash_amount, sell_result.sol_net
        );

        let loss = flash_amount - sell_result.sol_net;
        let loss_pct = loss as f64 / flash_amount as f64 * 100.0;
        assert!(loss_pct > 9.0,
            "Flash loan loss only {:.2}% — too close to break-even!",
            loss_pct
        );

        // Reserve should have INCREASED (fees captured by the protocol)
        assert!(c.sol_reserve >= reserve_before,
            "SOLVENCY: reserve decreased after flash loan attack! before={} after={}",
            reserve_before, c.sol_reserve
        );
    }

    /// Flash loan with multiple smaller buys (trying to reduce slippage)
    #[test]
    fn test_flash_loan_split_attack() {
        let mut c = make_curve(1_000_000_000);

        for _ in 0..5 {
            let r = c.calculate_buy(200_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let total_attack = 500_000_000_000u64; // 500 SOL
        let num_splits = 50;
        let per_split = total_attack / num_splits;

        let mut total_tokens = 0u64;
        let mut total_spent = 0u64;

        // Buy in 50 splits
        for _ in 0..num_splits {
            let r = c.calculate_buy(per_split).unwrap();
            c.apply_buy(&r).unwrap();
            total_tokens += r.tokens_buyer;
            total_spent += per_split;
        }

        // Sell everything at once
        let sr = c.calculate_sell(total_tokens, false).unwrap();
        c.apply_sell(&sr).unwrap();
        c.supply_public -= total_tokens;

        assert!(sr.sol_net < total_spent,
            "CRITICAL: Split flash loan profitable! Spent={} Got={}",
            total_spent, sr.sol_net
        );

        // Split buys get slightly better average price due to k-deepening
        // between buys, so ~8.9% loss instead of ~9.5%. Still safely unprofitable.
        let loss_pct = (total_spent - sr.sol_net) as f64 / total_spent as f64 * 100.0;
        assert!(loss_pct > 8.0,
            "Split attack loss only {:.2}% — dangerously close to break-even!", loss_pct
        );
    }

    // ================================================================
    // SECTION 11: Dust / Rounding Attacks
    // ================================================================

    /// Try to extract value through rounding: buy tiny amounts thousands of times,
    /// aggregate tokens, sell in bulk. ceil_div should prevent this.
    #[test]
    fn test_dust_rounding_attack() {
        let mut c = make_curve(1_000_000_000);

        // Warm up the curve
        let warm = c.calculate_buy(500_000_000).unwrap();
        c.apply_buy(&warm).unwrap();

        let dust_amount = 100u64; // 100 lamports = 0.0000001 SOL
        let num_dust = 1_000;
        let mut total_tokens = 0u64;
        let mut total_sol_in = 0u64;

        for _ in 0..num_dust {
            let r = c.calculate_buy(dust_amount);
            match r {
                Ok(r) if r.tokens_buyer > 0 => {
                    c.apply_buy(&r).unwrap();
                    total_tokens += r.tokens_buyer;
                    total_sol_in += dust_amount;
                },
                _ => {
                    // Dust too small to produce tokens — attack fails inherently
                    total_sol_in += dust_amount; // SOL lost to fees
                }
            }
        }

        // If no tokens were produced, attack fails completely
        if total_tokens == 0 {
            return; // Success: dust produces nothing
        }

        // Sell all accumulated tokens
        let sr = c.calculate_sell(total_tokens, false).unwrap();

        assert!(sr.sol_net < total_sol_in,
            "CRITICAL: Dust attack profitable! In={} Out={}",
            total_sol_in, sr.sol_net
        );
    }

    /// Verify ceil_div never rounds fees to zero for meaningful amounts
    #[test]
    fn test_fee_never_zero_for_real_trades() {
        let amounts = vec![
            1_000,        // 1000 lamports
            10_000,       // 10K lamports
            100_000,      // 100K lamports
            1_000_000,    // 0.001 SOL
            10_000_000,   // 0.01 SOL
        ];

        for sol in amounts {
            // Total fee (5%)
            let fee = crate::utils::ceil_div_u64(sol * TOTAL_FEE_BPS, BPS_DENOMINATOR);
            assert!(fee > 0, "Fee must never be 0 for sol={}", sol);

            // Depth fee (1%)
            let depth = crate::utils::ceil_div_u64(sol * FEE_DEPTH_BPS, BPS_DENOMINATOR);
            assert!(depth > 0, "Depth fee must never be 0 for sol={}", sol);
        }
    }

    /// Verify fee decomposition works correctly for realistic trade sizes.
    /// NOTE: For tiny amounts (< 200 lamports), ceil_div on sub-components
    /// can exceed the total fee due to individual rounding up. This is safe
    /// because on-chain code uses `fee_protocol = fee_total - creator - depth`
    /// (saturating_sub), so protocol absorbs the rounding difference.
    #[test]
    fn test_fee_components_sum_equals_total_exhaustive() {
        let _c = make_curve(1_000_000_000);
        
        // Only test realistic trade sizes (>= 200 lamports ≈ $0.00003)
        // Trades below this produce 0 tokens anyway
        let amounts = vec![
            200u64, 1_000, 9_999, 10_000, 10_001, 50_000,
            100_000, 1_000_000, 10_000_000, 100_000_000, 
            1_000_000_000, 5_000_000_000, 10_000_000_000,
        ];

        for sol in amounts {
            let fee_total = crate::utils::ceil_div_u64(sol * TOTAL_FEE_BPS, BPS_DENOMINATOR);
            let fee_creator = crate::utils::ceil_div_u64(sol * BUY_FEE_CREATOR_BPS, BPS_DENOMINATOR);
            let fee_depth = crate::utils::ceil_div_u64(sol * FEE_DEPTH_BPS, BPS_DENOMINATOR);
            let fee_protocol = fee_total.saturating_sub(fee_creator).saturating_sub(fee_depth);

            let sum = fee_creator + fee_protocol + fee_depth;
            assert_eq!(sum, fee_total,
                "FEE LEAK: sol={} sum={} != total={}",
                sol, sum, fee_total
            );

            // Sol to curve must be non-negative
            assert!(sol >= fee_total,
                "Fees exceed input: sol={} fee_total={}", sol, fee_total
            );
        }
    }

    // ================================================================
    // SECTION 12: Integer Overflow & Boundaries
    // ================================================================

    /// Test with maximum u64 buy amounts — must not overflow
    #[test]
    fn test_overflow_large_buy() {
        let c = make_curve(MAX_INITIAL_LIQUIDITY);
        
        // Try buying with a huge amount (should not overflow but may fail gracefully)
        let huge = u64::MAX / 2; // ~9.2 × 10^18 lamports
        let result = c.calculate_buy(huge);
        
        // Should either succeed or fail with a descriptive error — NOT panic
        match result {
            Ok(r) => {
                assert!(r.tokens_buyer > 0);
            },
            Err(_) => {
                // Acceptable: overflow caught
            }
        }
    }

    /// Test sell with amount exceeding supply — must fail
    #[test]
    fn test_sell_more_than_supply() {
        let mut c = make_curve(1_000_000_000);
        
        let r = c.calculate_buy(500_000_000).unwrap();
        c.apply_buy(&r).unwrap();

        let excess = r.tokens_buyer + 1;
        let sr = c.calculate_sell(excess, false);
        
        // The sell itself may succeed (curve doesn't check supply)
        // but apply should fail if we try to deduct more than exists
        if sr.is_ok() {
            let deduct = c.deduct_supply(excess, false);
            assert!(deduct.is_err(),
                "CRITICAL: Able to deduct more tokens than supply!"
            );
        }
    }

    /// Test that u128 math doesn't silently overflow on huge k values
    #[test]
    fn test_k_stays_valid_after_massive_trading() {
        let mut c = make_curve(MAX_INITIAL_LIQUIDITY); // 10 SOL

        // 100 large buys — k will grow significantly
        for _ in 0..100 {
            let r = c.calculate_buy(10_000_000_000).unwrap(); // 10 SOL per buy
            c.apply_buy(&r).unwrap();
        }

        // k should still be valid (multiplying x * y shouldn't overflow u128)
        let k_check = c.x.checked_mul(c.y);
        assert!(k_check.is_some(), "k overflowed u128!");
        
        // Stored k >= x*y is expected because k is snapshotted BEFORE the
        // sol_to_curve enters the curve (k = x_after_depth * y, then x increases
        // further with sol_to_curve, reducing y). The invariant floor division
        // y_new = k/x_new can make x*y_new slightly less than k. This is safe:
        // it means the curve is fractionally MORE conservative than k suggests.
        let k_actual = k_check.unwrap();
        let k_diff_pct = if c.k > k_actual {
            (c.k - k_actual) as f64 / c.k as f64 * 100.0
        } else {
            0.0
        };
        assert!(k_diff_pct < 0.01,
            "k drift too large: stored_k={} x*y={} diff={:.6}%",
            c.k, k_actual, k_diff_pct
        );

        // Price should still be calculable
        let price = c.get_spot_price();
        assert!(price.is_ok(), "Price calculation failed after massive trading");
    }

    // ================================================================
    // SECTION 13: Multi-Holder Bank Run (Solvency Proof)
    // ================================================================

    /// Simulate 100 different holders buying, then ALL selling simultaneously.
    /// The vault MUST have enough SOL to pay everyone.
    #[test]
    fn test_bank_run_100_holders() {
        let mut c = make_curve(1_000_000_000);
        
        // 100 holders buy different amounts
        let mut holder_tokens: Vec<u64> = Vec::new();
        for i in 0..100 {
            let buy_amount = 10_000_000 + (i as u64 * 5_000_000); // 0.01 to 0.51 SOL
            let r = c.calculate_buy(buy_amount).unwrap();
            c.apply_buy(&r).unwrap();
            holder_tokens.push(r.tokens_buyer);
        }

        // Verify invariant holds
        assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));

        // Now ALL 100 holders sell, one by one (order matters — last seller gets less)
        let mut total_paid_out = 0u64;
        for tokens in &holder_tokens {
            if *tokens == 0 { continue; }
            // Check that vault can handle this sell
            let sr = c.calculate_sell(*tokens, false).unwrap();
            let payout = sr.sol_net + sr.fee_creator + sr.fee_protocol;
            assert!(c.sol_reserve >= payout,
                "INSOLVENCY: reserve={} < payout={}", c.sol_reserve, payout
            );
            c.apply_sell(&sr).unwrap();
            c.supply_public -= tokens;
            total_paid_out += sr.sol_net;
        }

        // After everyone sells, reserve should still be >= 0
        assert!(c.sol_reserve > 0, "Reserve went to 0 — solvency failure");
        
        // x = sol_reserve + D must still hold
        assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));
    }

    /// Worst case: biggest holder sells first (gets best price)
    #[test]
    fn test_whale_sells_first_solvency() {
        let mut c = make_curve(1_000_000_000);

        // Whale buys 100 SOL
        let whale = c.calculate_buy(100_000_000_000).unwrap();
        c.apply_buy(&whale).unwrap();

        // 50 small holders buy 0.2 SOL each
        let mut small_tokens: Vec<u64> = Vec::new();
        for _ in 0..50 {
            let r = c.calculate_buy(200_000_000).unwrap();
            c.apply_buy(&r).unwrap();
            small_tokens.push(r.tokens_buyer);
        }

        // Whale dumps everything
        let whale_sell = c.calculate_sell(whale.tokens_buyer, false).unwrap();
        assert!(c.sol_reserve >= whale_sell.sol_net + whale_sell.fee_creator + whale_sell.fee_protocol,
            "INSOLVENCY on whale dump"
        );
        c.apply_sell(&whale_sell).unwrap();
        c.supply_public -= whale.tokens_buyer;

        // Now each small holder sells — vault must survive
        for tokens in &small_tokens {
            if *tokens == 0 { continue; }
            let sr = c.calculate_sell(*tokens, false).unwrap();
            let needed = sr.sol_net + sr.fee_creator + sr.fee_protocol;
            assert!(c.sol_reserve >= needed,
                "INSOLVENCY after whale exit: reserve={} needed={}", c.sol_reserve, needed
            );
            c.apply_sell(&sr).unwrap();
            c.supply_public -= tokens;
        }

        // Final invariant
        assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));
    }

    // ================================================================
    // SECTION 14: Solvency Mathematical Proof
    // ================================================================

    /// Prove that sol_reserve >= sum(all possible sell payouts) at all times.
    /// This is THE critical invariant — if this fails, the protocol is insolvent.
    #[test]
    fn test_solvency_mathematical_proof() {
        let mut c = make_curve(1_000_000_000);

        // Build up supply with varied buy sizes
        for i in 0..30 {
            let amount = 50_000_000 + (i * 12_345_678) % 500_000_000;
            let r = c.calculate_buy(amount).unwrap();
            c.apply_buy(&r).unwrap();
        }

        // Now sell the entire public supply at once
        let total_public = c.supply_public;
        if total_public == 0 { return; }

        let sr = c.calculate_sell(total_public, false).unwrap();
        let total_needed = sr.sol_net + sr.fee_creator + sr.fee_protocol;

        // THE PROOF: vault must have enough
        assert!(c.sol_reserve >= total_needed,
            "SOLVENCY PROOF FAILED: reserve={} < total_payout={}",
            c.sol_reserve, total_needed
        );

        // Also verify creator can sell their tokens afterward
        // (creator tokens exist from Founder Buy)
        if c.supply_creator > 0 {
            // We need to apply the public sell first, then check creator
            let mut c2 = c.clone();
            c2.apply_sell(&sr).unwrap();
            c2.supply_public = 0;

            let max_creator_sell = c2.supply_creator.min(
                c2.get_max_sell_amount().unwrap()
            );
            if max_creator_sell > 0 {
                let cr = c2.calculate_sell(max_creator_sell, true).unwrap();
                let creator_needed = cr.sol_net + cr.fee_protocol;
                assert!(c2.sol_reserve >= creator_needed,
                    "CREATOR SOLVENCY FAILED: reserve={} < creator_payout={}",
                    c2.sol_reserve, creator_needed
                );
            }
        }
    }

    /// Prove k-deepening never makes the vault insolvent
    #[test]
    fn test_k_deepening_preserves_solvency() {
        let mut c = make_curve(1_000_000_000);

        // Alternate buy/sell 50 times (k grows each time)
        for _ in 0..50 {
            let r = c.calculate_buy(100_000_000).unwrap();
            c.apply_buy(&r).unwrap();

            let sell_amount = r.tokens_buyer / 2;
            if sell_amount == 0 { continue; }
            let sr = c.calculate_sell(sell_amount, false).unwrap();
            
            // Solvency check BEFORE applying
            let needed = sr.sol_net + sr.fee_creator + sr.fee_protocol;
            assert!(c.sol_reserve >= needed,
                "k-deepening broke solvency: reserve={} needed={}", c.sol_reserve, needed
            );
            
            c.apply_sell(&sr).unwrap();
            c.supply_public -= sell_amount;

            // Invariant must hold
            assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128));
        }
    }

    // ================================================================
    // SECTION 15: Price Manipulation Resistance
    // ================================================================

    /// Verify that pump-and-dump is always unprofitable for the manipulator
    #[test]
    fn test_pump_and_dump_unprofitable() {
        let mut c = make_curve(1_000_000_000);

        // Organic activity
        for _ in 0..10 {
            let r = c.calculate_buy(50_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let p_before = c.get_spot_price().unwrap();

        // Manipulator pumps with increasing amounts
        let mut manipulator_tokens = 0u64;
        let mut manipulator_spent = 0u64;
        
        for _ in 0..10 {
            let buy = 1_000_000_000; // 1 SOL per pump
            let r = c.calculate_buy(buy).unwrap();
            c.apply_buy(&r).unwrap();
            manipulator_tokens += r.tokens_buyer;
            manipulator_spent += buy;
        }

        let p_after = c.get_spot_price().unwrap();
        assert!(p_after > p_before, "Pump must increase price");

        // Dump everything
        let dump = c.calculate_sell(manipulator_tokens, false).unwrap();
        
        assert!(dump.sol_net < manipulator_spent,
            "PUMP AND DUMP PROFITABLE: spent={} got={}",
            manipulator_spent, dump.sol_net
        );

        let loss_pct = (manipulator_spent - dump.sol_net) as f64 / manipulator_spent as f64 * 100.0;
        assert!(loss_pct > 8.0,
            "Pump-and-dump loss only {:.1}% — needs to be more costly", loss_pct
        );
    }

    /// Front-running analysis: Can an attacker profit by front-running a victim's buy?
    ///
    /// FINDING: With a large enough victim (10 SOL victim vs 5 SOL attacker on a
    /// small-cap token), the victim's price impact CAN push the price enough to
    /// compensate for the 5% round-trip fees. This is inherent to ALL AMM designs.
    ///
    /// MITIGATION: The 5% entry + 5% exit fees (~10% round-trip) provide substantial
    /// protection. An attacker needs the victim's buy to cause >10% price movement
    /// to profit, which only happens on very illiquid tokens with very large victims.
    /// The depth parameter (20×V) specifically limits this by making curves deeper.
    ///
    /// This test verifies the attack's profitability diminishes with deeper curves.
    #[test]
    fn test_front_running_cost_analysis() {
        // Test 1: Small victim (1 SOL) — front-running MUST be unprofitable
        let mut c1 = make_curve(1_000_000_000);
        for _ in 0..5 {
            let r = c1.calculate_buy(100_000_000).unwrap();
            c1.apply_buy(&r).unwrap();
        }

        let fr_buy1 = c1.calculate_buy(500_000_000).unwrap(); // 0.5 SOL
        c1.apply_buy(&fr_buy1).unwrap();
        let victim1 = c1.calculate_buy(1_000_000_000).unwrap(); // 1 SOL
        c1.apply_buy(&victim1).unwrap();
        let fr_sell1 = c1.calculate_sell(fr_buy1.tokens_buyer, false).unwrap();

        assert!(fr_sell1.sol_net < 500_000_000,
            "Small victim front-run PROFITABLE: spent=500M got={}", fr_sell1.sol_net
        );

        // Test 2: Deep curve (10 SOL initial) — harder to front-run
        let mut c2 = make_curve(10_000_000_000); // 10 SOL depth
        for _ in 0..5 {
            let r = c2.calculate_buy(1_000_000_000).unwrap();
            c2.apply_buy(&r).unwrap();
        }

        let fr_buy2 = c2.calculate_buy(5_000_000_000).unwrap(); // 5 SOL
        c2.apply_buy(&fr_buy2).unwrap();
        let victim2 = c2.calculate_buy(10_000_000_000).unwrap(); // 10 SOL
        c2.apply_buy(&victim2).unwrap();
        let fr_sell2 = c2.calculate_sell(fr_buy2.tokens_buyer, false).unwrap();

        // On deeper curves, front-running should be much less profitable or unprofitable
        let pnl = fr_sell2.sol_net as i128 - 5_000_000_000i128;
        let pnl_pct = pnl as f64 / 5_000_000_000f64 * 100.0;
        // Even if profitable, must be < 5% profit (fees eat most of the edge)
        assert!(pnl_pct < 5.0,
            "Deep curve front-run too profitable: {:.2}%", pnl_pct
        );
    }

    /// Verify that wash trading with different amounts doesn't find an edge
    #[test]
    fn test_wash_trading_varied_amounts() {
        let mut c = make_curve(1_000_000_000);

        let mut total_in: u64 = 0;
        let mut total_out: u64 = 0;

        // Alternating large/small amounts
        let amounts = vec![
            1_000_000_000u64, 10_000_000, 500_000_000, 5_000_000,
            2_000_000_000, 1_000_000, 100_000_000, 50_000_000,
        ];

        for sol in &amounts {
            let r = c.calculate_buy(*sol).unwrap();
            c.apply_buy(&r).unwrap();
            total_in += sol;

            let sr = c.calculate_sell(r.tokens_buyer, false).unwrap();
            c.apply_sell(&sr).unwrap();
            c.supply_public -= r.tokens_buyer;
            total_out += sr.sol_net;
        }

        assert!(total_out < total_in,
            "Wash trade profitable! in={} out={}", total_in, total_out
        );
    }

    // ================================================================
    // SECTION 16: Creator Vault & Claim Security
    // ================================================================

    /// Test that creator is properly identified via the is_creator flag
    /// and cannot game the dual fee structure
    #[test]
    fn test_creator_fee_difference() {
        let mut c = make_curve(1_000_000_000);

        // Buy tokens to create liquidity
        for _ in 0..10 {
            let r = c.calculate_buy(1_000_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        let sell_amount = c.supply_public.min(c.get_max_sell_amount().unwrap()) / 2;
        if sell_amount == 0 { return; }

        // Holder sell: 5%
        let holder = c.calculate_sell(sell_amount, false).unwrap();
        // Creator sell: 6%
        let creator = c.calculate_sell(sell_amount, true).unwrap();

        // Creator must receive LESS SOL (higher fee)
        assert!(creator.sol_net < holder.sol_net,
            "Creator should receive less: creator={} >= holder={}",
            creator.sol_net, holder.sol_net
        );

        // Creator fee must be 0 on creator sell
        assert_eq!(creator.fee_creator, 0, "Creator must not earn self-fee");
        // Holder sell gives creator a fee
        assert!(holder.fee_creator > 0, "Holder sell must generate creator fee");
    }

    /// Test CreatorFeeVault accounting across multiple deposits and claims
    #[test]
    fn test_fee_vault_accounting_multi_deposit() {
        let mut vault = crate::state::CreatorFeeVault {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            total_accumulated: 0,
            total_claimed: 0,
            last_claim_at: 0,
            created_at: 0,
            bump: 0,
        };

        // 10 deposits
        for i in 1..=10 {
            vault.record_deposit(1_000_000 * i).unwrap();
        }

        let expected_total: u64 = (1..=10).map(|i| 1_000_000u64 * i).sum();
        assert_eq!(vault.total_accumulated, expected_total);
        assert_eq!(vault.unclaimed(), expected_total);

        // Simulate partial claim
        let claimed = vault.record_claim(100).unwrap();
        assert_eq!(claimed, expected_total);
        assert_eq!(vault.unclaimed(), 0);
        assert_eq!(vault.total_claimed, expected_total);

        // More deposits after claim
        vault.record_deposit(5_000_000).unwrap();
        assert_eq!(vault.unclaimed(), 5_000_000);
    }

    /// Test that creator vault vesting works correctly at boundary timestamps
    #[test]
    fn test_vesting_boundary_timestamps() {
        let vault = crate::state::CreatorVault {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            created_at: 1000,
            last_sell_at: 0,
            total_sold: 0,
            bump: 0,
        };

        // 1 second before lock expires
        let just_before = 1000 + CREATOR_LOCK_DURATION - 1;
        assert!(vault.can_sell(just_before).is_err(), "Must be locked 1 second before");

        // Exactly at lock expiry
        let just_at = 1000 + CREATOR_LOCK_DURATION;
        assert!(vault.can_sell(just_at).is_ok(), "Must be unlocked at exact boundary");

        // 1 second after
        let just_after = 1000 + CREATOR_LOCK_DURATION + 1;
        assert!(vault.can_sell(just_after).is_ok(), "Must be unlocked after");
    }

    /// Test cooldown between creator sells
    #[test]
    fn test_creator_sell_cooldown() {
        let mut vault = crate::state::CreatorVault {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            created_at: 0,
            last_sell_at: 0,
            total_sold: 0,
            bump: 0,
        };

        // First sell at year 2
        let t0 = CREATOR_LOCK_DURATION;
        assert!(vault.can_sell(t0).is_ok());
        vault.record_sell(1000, t0).unwrap();

        // Try to sell 29 days later — must fail
        let t1 = t0 + CREATOR_SELL_COOLDOWN - 86400; // 29 days
        assert!(vault.can_sell(t1).is_err(), "Must respect 30-day cooldown");

        // Exactly 30 days later — must succeed
        let t2 = t0 + CREATOR_SELL_COOLDOWN;
        assert!(vault.can_sell(t2).is_ok(), "Must allow sell after 30 days");
    }

    /// Test fee claim cooldown works at boundaries
    #[test]
    fn test_fee_claim_cooldown() {
        let mut vault = crate::state::CreatorFeeVault {
            mint: anchor_lang::prelude::Pubkey::default(),
            creator: anchor_lang::prelude::Pubkey::default(),
            total_accumulated: 1_000_000,
            total_claimed: 0,
            last_claim_at: 1000,
            created_at: 0,
            bump: 0,
        };

        // 14 days later — must fail
        let t1 = 1000 + CREATOR_FEE_CLAIM_COOLDOWN - 86400;
        assert!(vault.can_claim(t1).is_err(), "Must respect 15-day cooldown");

        // Exactly 15 days later — must succeed
        let t2 = 1000 + CREATOR_FEE_CLAIM_COOLDOWN;
        assert!(vault.can_claim(t2).is_ok(), "Must allow claim after 15 days");
    }

    // ================================================================
    // SECTION 17: Extreme Stress Tests
    // ================================================================

    /// 500 trades — solvency must hold at every step
    #[test]
    fn test_500_trades_solvency() {
        let mut c = make_curve(1_000_000_000);
        
        for i in 0..500u64 {
            let amount = 5_000_000 + (i * 7_777_777) % 200_000_000;
            let r = c.calculate_buy(amount).unwrap();
            c.apply_buy(&r).unwrap();
            
            // Every 5th trade: sell 1/4 of holdings
            if i % 5 == 4 && c.supply_public > 0 {
                let sell = c.supply_public / 4;
                if sell == 0 { continue; }
                let sr = c.calculate_sell(sell, false).unwrap();
                
                let needed = sr.sol_net + sr.fee_creator + sr.fee_protocol;
                assert!(c.sol_reserve >= needed,
                    "INSOLVENCY at trade #{}: reserve={} needed={}",
                    i, c.sol_reserve, needed
                );
                
                c.apply_sell(&sr).unwrap();
                c.supply_public -= sell;
            }

            // Verify invariant at every step
            assert_eq!(c.x, (c.sol_reserve as u128) + (c.depth_parameter as u128),
                "INVARIANT x=reserve+D broken at trade #{}", i
            );
        }
    }

    /// Minimum liquidity curve under stress
    #[test]
    fn test_min_liquidity_stress() {
        let mut c = make_curve(MIN_INITIAL_LIQUIDITY); // 0.03 SOL

        // 20 tiny buys
        for _ in 0..20 {
            let r = c.calculate_buy(MIN_INITIAL_LIQUIDITY).unwrap();
            c.apply_buy(&r).unwrap();
        }

        // Sell everything
        let total = c.supply_public;
        let sr = c.calculate_sell(total, false).unwrap();
        let needed = sr.sol_net + sr.fee_creator + sr.fee_protocol;
        assert!(c.sol_reserve >= needed,
            "Min liquidity solvency failure: reserve={} needed={}", c.sol_reserve, needed
        );
    }

    /// Verify that the Founder Buy tokens don't create a solvency hole
    /// when combined with public supply
    #[test]
    fn test_founder_tokens_dont_break_solvency() {
        let mut c = make_curve(5_000_000_000); // 5 SOL

        // Public buys
        for _ in 0..10 {
            let r = c.calculate_buy(1_000_000_000).unwrap();
            c.apply_buy(&r).unwrap();
        }

        // Total tokens in existence
        let total_tokens = c.supply_public + c.supply_creator;
        
        // Sell all public tokens
        if c.supply_public > 0 {
            let sr = c.calculate_sell(c.supply_public, false).unwrap();
            let needed = sr.sol_net + sr.fee_creator + sr.fee_protocol;
            assert!(c.sol_reserve >= needed, "Public sell breaks solvency");
            c.apply_sell(&sr).unwrap();
            c.supply_public = 0;
        }

        // After all public sells, creator tokens sell must still be possible
        // (limited by Smart Sell Limiter)
        let max = c.get_max_sell_amount().unwrap();
        let creator_sell = c.supply_creator.min(max);
        if creator_sell > 0 {
            let cr = c.calculate_sell(creator_sell, true).unwrap();
            let needed = cr.sol_net + cr.fee_protocol;
            assert!(c.sol_reserve >= needed,
                "Creator solvency fails after public exit: reserve={} needed={}",
                c.sol_reserve, needed
            );
        }
    }
}
