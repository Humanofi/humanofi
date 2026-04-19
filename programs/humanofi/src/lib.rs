// ========================================
// Humanofi — Program Entry Point (v3.8)
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
// Tokenomics: The Human Curve™ (v3.7)
//   → Constant-product AMM: x · y = k(t) with k-evolution
//   → Depth Parameter D = 20×V (mathematical depth, like Curve's A factor)
//   → Founder Buy: creator gets tokens at P₀ during creation (locked)
//   → Buy fees: 5% (3% creator vault + 1% protocol + 1% k-depth)
//   → Sell fees: 5% (1% creator vault + 3% protocol + 1% k-depth)
//   → Creator sell: 6% total (5% protocol + 1% k-depth, no self-fee)
//   → Smart Sell Limiter: creator capped at 5% price impact per sell
//   → No holder dividends (legal compliance — holders profit via token appreciation)
//   → Merit Reward: REMOVED in v3.6 (buyer gets 100% of tokens)
//
// Security (v3.8):
//   → CPI Guard: buy/sell reject program-to-program calls (anti-bot)
//   → Flash Loan proof: frozen tokens = no transfer = no flash loan
//   → Tokens are ONLY tradable within Humanofi. Period.
//   → Emergency Freeze: ProtocolConfig PDA with global kill switch
//   → Creator Suspension: redirect fees + block sell/claim (holders unaffected)

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

    // ── ADMIN INSTRUCTIONS ──────────────────────────────

    /// Initialize the ProtocolConfig PDA (one-time setup).
    /// The caller becomes the initial authority.
    /// Transfer to Squads multisig after deployment.
    pub fn init_config(ctx: Context<InitConfig>) -> Result<()> {
        instructions::admin::handler_init_config(ctx)
    }

    /// Emergency freeze/unfreeze all protocol operations.
    /// When frozen, buy/sell/create/claim are ALL blocked on-chain.
    pub fn toggle_freeze(
        ctx: Context<ToggleFreeze>,
        freeze: bool,
        reason: String,
    ) -> Result<()> {
        instructions::admin::handler_toggle_freeze(ctx, freeze, reason)
    }

    /// Suspend a creator (authority only).
    /// Effects: fees redirected to treasury, creator sell/claim blocked.
    /// Holders can still buy (with warning) and sell normally.
    pub fn suspend_creator(ctx: Context<SuspendCreator>) -> Result<()> {
        instructions::admin::handler_suspend_creator(ctx)
    }

    /// Lift a creator suspension (authority only).
    pub fn unsuspend_creator(ctx: Context<UnsuspendCreator>) -> Result<()> {
        instructions::admin::handler_unsuspend_creator(ctx)
    }

    // ── CORE INSTRUCTIONS ───────────────────────────────

    /// Creates a new personal token with the Human Curve™ + Founder Buy.
    ///
    /// Initializes:
    /// - Token-2022 Mint (freeze_authority = bonding_curve PDA)
    /// - BondingCurve PDA (Human Curve™: x · y = k, SOL reserve)
    /// - CreatorVault PDA (vesting + Smart Sell Limiter tracker)
    /// - CreatorFeeVault PDA (accumulates 3% on buy, 1% on sell)
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
    /// - Fees: 3% creator vault + 1% protocol + 1% k-depth (5% total)
    ///   (if creator suspended: ALL fees → protocol treasury)
    /// - Mint 100% tokens → buyer ATA (frozen)
    /// - Slippage protection: reverts if tokens received < min_tokens_out
    pub fn buy(ctx: Context<Buy>, sol_amount: u64, min_tokens_out: u64) -> Result<()> {
        instructions::buy::handler(ctx, sol_amount, min_tokens_out)
    }

    /// Sell tokens back via the Human Curve™.
    ///
    /// Dual fee structure (v3.7):
    /// - Holder sell: 5% (1% creator + 3% protocol + 1% depth)
    ///   (if creator suspended: 0% creator + 4% protocol + 1% depth)
    /// - Creator sell: 6% (5% protocol + 1% depth, no self-fee)
    ///   (if creator suspended: BLOCKED entirely)
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
    /// - BLOCKED if creator is suspended
    pub fn claim_creator_fees(ctx: Context<ClaimCreatorFees>) -> Result<()> {
        instructions::claim_creator_fees::handler(ctx)
    }
}

