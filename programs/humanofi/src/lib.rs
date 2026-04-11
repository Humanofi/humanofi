// ========================================
// Humanofi — Program Entry Point
// ========================================
//
// The first market where humans are the asset.
//
// Architecture:
//   Token-2022 Mint — freeze_authority = bonding_curve PDA
//   → All token accounts are FROZEN by default
//   → Only the program (via CPI) can thaw/freeze
//   → Tokens cannot be transferred on Jupiter, Raydium, or wallet-to-wallet
//   → Buy = mint + freeze, Sell = thaw + burn + freeze
//
// Tokenomics: The Human Curve™
//   → Constant-product AMM: x · y = k(t) with k-evolution
//   → Depth Parameter D = 20×V (mathematical depth, like Curve's A factor)
//   → Merit Reward: 12.6% of tokens to creator + 1.4% to protocol on each buy
//   → Fees: 6% total (2% creator + 2% holders + 1% protocol + 1% k-depth)
//   → Smart Sell Limiter: creator capped at 5% price impact per sell
//   → Price Stabilizer: auto-sells protocol tokens to smooth price spikes
//
// Security:
//   → CPI Guard: buy/sell reject program-to-program calls (anti-bot)
//   → Flash Loan proof: frozen tokens = no transfer = no flash loan
//   → Tokens are ONLY tradable within Humanofi. Period.

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("C88xL1xsuSi4g8yXDY3MtZUKiAcH1RTs9eQSLVpm4YiR");

#[program]
pub mod humanofi {
    use super::*;

    /// Creates a new personal token with the Human Curve™.
    ///
    /// Initializes:
    /// - Token-2022 Mint (freeze_authority = bonding_curve PDA)
    /// - BondingCurve PDA (Human Curve™: x · y = k, SOL reserve)
    /// - CreatorVault PDA (vesting + Smart Sell Limiter tracker)
    /// - RewardPool PDA (holder fee accumulator)
    /// - ProtocolVault PDA (Stabilizer token treasury)
    /// - On-chain metadata (name, symbol, image URI)
    /// - Initial SOL liquidity injected into bonding curve reserve
    ///
    /// No tokens are minted at creation. Creator earns tokens
    /// via the Merit Reward (12.6%) on each subsequent buy.
    /// Protocol earns 1.4% for the Price Stabilizer.
    pub fn create_token(
        ctx: Context<CreateToken>,
        name: String,
        symbol: String,
        uri: String,
        initial_liquidity: u64,
    ) -> Result<()> {
        instructions::create_token::handler(ctx, name, symbol, uri, initial_liquidity)
    }

    /// Buy tokens from the Human Curve™.
    ///
    /// - CPI Guard: rejects program-to-program calls (anti-bot)
    /// - SOL → Human Curve calculation (k-deepening + merit split)
    /// - Fees: 2% creator SOL + 2% holder pool + 1% protocol + 1% k-depth
    /// - Mint 86% tokens → buyer ATA (frozen)
    /// - Mint 12.6% tokens → creator ATA (Merit Reward, frozen)
    /// - Mint 1.4% tokens → protocol ATA (Merit Fee, frozen)
    /// - Price Stabilizer: auto-sells protocol tokens if price spiked > 2%
    /// - Slippage protection: reverts if tokens received < min_tokens_out
    pub fn buy(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        instructions::buy::handler(ctx, sol_amount, min_tokens_out)
    }

    /// Sell tokens back via the Human Curve™.
    ///
    /// - CPI Guard: rejects program-to-program calls (anti-bot)
    /// - If creator: verify vesting (Year 1 lock) + Smart Sell Limiter (5% impact max) + cooldown (30 days)
    /// - Thaw → Burn → Calculate SOL return → Distribute fees → Transfer → Re-freeze
    /// - k-deepening: 1% of gross SOL stays in curve (k grows)
    /// - Slippage protection: reverts if SOL received < min_sol_out
    pub fn sell(ctx: Context<Sell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
        instructions::sell::handler(ctx, token_amount, min_sol_out)
    }

    /// Claim accumulated rewards from the holder fee pool.
    ///
    /// ENGAGEMENT GATED: Holder must have >= MIN_ENGAGEMENT_ACTIONS
    /// in the current epoch (month) to qualify.
    ///
    /// Uses reward-per-token pattern (MasterChef, gas-efficient, O(1)):
    /// pending = balance × (global_rpt - personal_rpt) / precision
    pub fn claim_rewards(ctx: Context<ClaimRewards>, epoch: u64) -> Result<()> {
        instructions::claim_rewards::handler(ctx, epoch)
    }

    /// Record a holder's engagement score on-chain (ORACLE ONLY).
    ///
    /// Called by the API server (protocol authority) to attest
    /// that a holder has been active in the Inner Circle this month.
    pub fn record_engagement(ctx: Context<RecordEngagement>, actions_count: u16, epoch: u64) -> Result<()> {
        instructions::record_engagement::handler(ctx, actions_count, epoch)
    }
}
