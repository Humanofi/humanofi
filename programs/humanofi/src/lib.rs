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
// Tokenomics: The Human Curve™ (v2)
//   → Constant-product AMM: x · y = k(t) with k-evolution
//   → Depth Parameter D = 20×V (mathematical depth, like Curve's A factor)
//   → Merit Reward: 10% of tokens to creator + 4% to protocol on each buy
//   → Fees: 6% total (3% creator vault + 2% protocol + 1% k-depth)
//   → Smart Sell Limiter: creator capped at 5% price impact per sell
//   → Price Stabilizer: auto-sells protocol tokens to smooth price spikes
//   → No holder dividends (legal compliance — holders profit via token appreciation)
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

declare_id!("4u14FtDEdr1UqSXbwhDXDLi552Skm1TPodrtjKje2pmQ");

#[program]
pub mod humanofi {
    use super::*;

    /// Creates a new personal token with the Human Curve™.
    ///
    /// Initializes:
    /// - Token-2022 Mint (freeze_authority = bonding_curve PDA)
    /// - BondingCurve PDA (Human Curve™: x · y = k, SOL reserve)
    /// - CreatorVault PDA (vesting + Smart Sell Limiter tracker)
    /// - CreatorFeeVault PDA (accumulates 3% of trading fees)
    /// - ProtocolVault PDA (Stabilizer token treasury)
    /// - On-chain metadata (name, symbol, image URI)
    /// - Initial SOL liquidity injected into bonding curve reserve
    ///
    /// No tokens are minted at creation. Creator earns tokens
    /// via the Merit Reward (10%) on each subsequent buy.
    /// Protocol earns 4% for the Price Stabilizer.
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
    /// - Fees: 3% creator vault + 2% protocol + 1% k-depth
    /// - Mint 86% tokens → buyer ATA (frozen)
    /// - Mint 10% tokens → creator ATA (Merit Reward, frozen)
    /// - Mint 4% tokens → protocol ATA (Merit Fee, frozen)
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
    /// - Fees: 3% creator vault + 2% protocol + 1% k-depth
    /// - Slippage protection: reverts if SOL received < min_sol_out
    pub fn sell(ctx: Context<Sell>, token_amount: u64, min_sol_out: u64) -> Result<()> {
        instructions::sell::handler(ctx, token_amount, min_sol_out)
    }

    /// Claim accumulated creator fees from the CreatorFeeVault PDA.
    ///
    /// - Only the creator of the token can call this
    /// - 15-day cooldown between claims
    /// - All unclaimed fees transferred to creator's wallet as SOL
    pub fn claim_creator_fees(ctx: Context<ClaimCreatorFees>) -> Result<()> {
        instructions::claim_creator_fees::handler(ctx)
    }
}
