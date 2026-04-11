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

    /// Creates a new personal token with Token-2022.
    ///
    /// Initializes:
    /// - Token-2022 Mint (freeze_authority = bonding_curve PDA)
    /// - BondingCurve PDA (price engine + SOL reserve)
    /// - CreatorVault PDA (12-month lock tracker)
    /// - RewardPool PDA (holder fee accumulator)
    /// - Creator's ATA (minted + frozen)
    /// - Initial SOL liquidity injected into bonding curve reserve
    /// - On-chain metadata (name, symbol, image URI)
    pub fn create_token(
        ctx: Context<CreateToken>,
        name: String,
        symbol: String,
        uri: String,
        base_price: u64,
        slope: u64,
        initial_liquidity: u64,
    ) -> Result<()> {
        instructions::create_token::handler(ctx, name, symbol, uri, base_price, slope, initial_liquidity)
    }

    /// Buy tokens from the bonding curve.
    ///
    /// - CPI Guard: rejects program-to-program calls (anti-bot)
    /// - SOL → calculate tokens via bonding curve
    /// - Deduct 2% fee (50% creator / 30% holders / 20% treasury)
    /// - Mint tokens to buyer's ATA
    /// - Freeze buyer's ATA
    /// - Enforce purchase limits (progressive daily caps)
    pub fn buy(ctx: Context<Buy>, sol_amount: u64) -> Result<()> {
        instructions::buy::handler(ctx, sol_amount)
    }

    /// Sell tokens back to the bonding curve.
    ///
    /// - CPI Guard: rejects program-to-program calls (anti-bot)
    /// - Thaw seller's ATA
    /// - Burn tokens
    /// - Calculate SOL return via bonding curve
    /// - Apply exit tax (10% if sold < 90 days)
    /// - Deduct 2% fee (50/30/20 split)
    /// - Transfer SOL to seller
    /// - Re-freeze ATA if balance remains
    pub fn sell(ctx: Context<Sell>, token_amount: u64) -> Result<()> {
        instructions::sell::handler(ctx, token_amount)
    }

    /// Claim accumulated rewards from the holder fee pool.
    ///
    /// ENGAGEMENT GATED: Holder must have >= MIN_ENGAGEMENT_ACTIONS
    /// in the current epoch (month) to qualify. The engagement record
    /// is written by the protocol oracle via record_engagement.
    ///
    /// Uses reward-per-token pattern (gas-efficient, O(1)):
    /// pending = balance × (global_rpt - personal_rpt) / precision
    pub fn claim_rewards(ctx: Context<ClaimRewards>, epoch: u64) -> Result<()> {
        instructions::claim_rewards::handler(ctx, epoch)
    }

    /// Record a holder's engagement score on-chain (ORACLE ONLY).
    ///
    /// Called by the API server (protocol authority) to attest
    /// that a holder has been active in the Inner Circle this month.
    /// The EngagementRecord PDA is then verified during claim_rewards.
    pub fn record_engagement(ctx: Context<RecordEngagement>, actions_count: u16, epoch: u64) -> Result<()> {
        instructions::record_engagement::handler(ctx, actions_count, epoch)
    }

    /// Unlock creator tokens based on progressive vesting schedule.
    ///
    /// - Year 1: 0% — full lock, zero liquidity
    /// - Year 2: max 10% of original allocation
    /// - Year 3: max 10% additional (20% cumulative)
    /// - Year 4+: max 20% per year
    /// - Year 7+: 100% cumulative max
    ///
    /// Creator can NEVER dump their position. Skin in the game forever.
    pub fn unlock_tokens(ctx: Context<UnlockTokens>, amount_to_unlock: u64) -> Result<()> {
        instructions::unlock_tokens::handler(ctx, amount_to_unlock)
    }
}
