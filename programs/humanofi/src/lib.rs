// ========================================
// Humanofi — Program Entry Point (v3.6)
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
// Tokenomics: The Human Curve™ (v3.6)
//   → Constant-product AMM: x · y = k(t) with k-evolution
//   → Depth Parameter D = 20×V (mathematical depth, like Curve's A factor)
//   → Founder Buy: creator gets tokens at P₀ during creation (locked)
//   → Holder fees: 5% total (2% creator vault + 2% protocol + 1% k-depth)
//   → Creator sell: 6% total (5% protocol + 1% k-depth, no self-fee)
//   → Smart Sell Limiter: creator capped at 5% price impact per sell
//   → No holder dividends (legal compliance — holders profit via token appreciation)
//   → Merit Reward: REMOVED in v3.6 (buyer gets 100% of tokens)
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

    /// Creates a new personal token with the Human Curve™ + Founder Buy.
    ///
    /// Initializes:
    /// - Token-2022 Mint (freeze_authority = bonding_curve PDA)
    /// - BondingCurve PDA (Human Curve™: x · y = k, SOL reserve)
    /// - CreatorVault PDA (vesting + Smart Sell Limiter tracker)
    /// - CreatorFeeVault PDA (accumulates 2% of trading fees)
    /// - ProtocolVault PDA (kept for compat, empty in v3.6)
    /// - On-chain metadata (name, symbol, image URI)
    ///
    /// Founder Buy: Creator buys tokens at P₀ using initial_liquidity.
    /// 3% fee (2% protocol + 1% depth). Tokens locked via CreatorVault.
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
    /// - SOL → Human Curve calculation (k-deepening)
    /// - Fees: 2% creator vault + 2% protocol + 1% k-depth (5% total)
    /// - Mint 100% tokens → buyer ATA (frozen)
    /// - Slippage protection: reverts if tokens received < min_tokens_out
    pub fn buy(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        instructions::buy::handler(ctx, sol_amount, min_tokens_out)
    }

    /// Sell tokens back via the Human Curve™.
    ///
    /// Dual fee structure (v3.6):
    /// - Holder sell: 5% (2% creator + 2% protocol + 1% depth)
    /// - Creator sell: 6% (5% protocol + 1% depth, no self-fee)
    ///
    /// Creator-specific:
    /// - Year 1 lock, Smart Sell Limiter (5% impact max), 30-day cooldown
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
