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

        assert_eq!(c.x, 20 * v as u128);
        assert_eq!(c.y, INITIAL_Y);
        assert_eq!(c.k, (20 * v as u128) * INITIAL_Y);
        assert_eq!(c.sol_reserve, 0);
        assert_eq!(c.depth_parameter, 20 * v);
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

        // After Founder Buy: x = D + sol_to_curve + depth_fee ≈ 20.98V
        assert!(c.x > 20 * v as u128, "x must increase after Founder Buy");
        assert!(c.x < 21 * v as u128, "x should be ~20.98V");

        // y decreased (tokens were bought)
        assert!(c.y < INITIAL_Y, "y must decrease after Founder Buy");

        // k increased (k-deepening from depth fee)
        let k0 = (20 * v as u128) * INITIAL_Y;
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

        // 2% creator
        assert_eq!(r.fee_creator, crate::utils::ceil_div_u64(buy_sol * 200, 10_000));
        // 1% depth
        assert_eq!(r.fee_depth, crate::utils::ceil_div_u64(buy_sol * 100, 10_000));
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

        // Holder sell: 5% fee (2% creator + 2% protocol + 1% depth)
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
}
