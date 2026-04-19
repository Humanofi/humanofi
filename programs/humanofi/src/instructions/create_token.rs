// ========================================
// Humanofi — Create Token (Token-2022 + Human Curve™) — v3.6
// ========================================
//
// Creates a new personal token with:
//   - Token-2022 Mint with MetadataPointer extension
//   - Token Metadata (name, symbol, uri — visible in wallets)
//   - BondingCurve PDA initialized with Human Curve™ (x · y = k)
//   - CreatorFeeVault PDA initialized (accumulates 2% of fees)
//   - CreatorVault PDA initialized (vesting + sell limiter tracker)
//   - ProtocolVault PDA initialized (kept for backward compat, empty)
//   - Founder Buy: creator gets tokens at P₀ (locked via CreatorVault)
//
// v3.6 changes:
//   - Founder Buy: creator buys tokens at creation using initial_liquidity V
//   - x₀ = D (depth only), then V enters via the curve → creator gets tokens
//   - 3% Founder Buy fee (2% protocol + 1% depth, no creator self-fee)
//   - Tokens are locked: 1 year cliff, then Smart Sell Limiter applies
//
// freeze_authority = bonding_curve PDA → tokens only tradable on Humanofi.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        freeze_account, mint_to, token_metadata_initialize,
        FreezeAccount, Mint, MintTo, TokenInterface, TokenMetadataInitialize,
        TokenAccount,
    },
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

/// Creates a new personal token with the Human Curve™ and Founder Buy.
///
/// # Initialization (Depth Parameter D)
///   x₀ = DEPTH_RATIO × V (20 × V, depth only — no real SOL yet)
///   y₀ = INITIAL_Y (1,000,000 × 10^6)
///   k₀ = x₀ × y₀
///
/// # Founder Buy
///   V SOL enters the curve at P₀ with 3% fee:
///   - 2% → Protocol Treasury
///   - 1% → k-deepening (stays in vault)
///   - 97% → curve reserve
///   Creator receives tokens at the initial (lowest) price.
///
/// # Parameters
///   - name: Token name (1-32 chars)
///   - symbol: Token symbol (1-10 chars)
///   - uri: Metadata URI (image, etc.)
///   - initial_liquidity: SOL deposit in lamports (V)
pub fn handler(
    ctx: Context<CreateToken>,
    name: String,
    symbol: String,
    uri: String,
    initial_liquidity: u64,
) -> Result<()> {
    // ---- Validate inputs ----
    require!(
        initial_liquidity >= MIN_INITIAL_LIQUIDITY,
        HumanofiError::InsufficientInitialLiquidity
    );
    require!(
        initial_liquidity <= MAX_INITIAL_LIQUIDITY,
        HumanofiError::ExcessiveInitialLiquidity
    );
    require!(
        !name.is_empty() && name.len() <= 32,
        HumanofiError::InvalidTokenName
    );
    require!(
        !symbol.is_empty() && symbol.len() <= 10,
        HumanofiError::InvalidTokenSymbol
    );

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let curve_bump = ctx.bumps.bonding_curve;

    // ── EMERGENCY FREEZE CHECK ──
    require!(!ctx.accounts.config.is_frozen, HumanofiError::ProtocolFrozen);

    // ---- Initialize on-chain metadata (Token-2022 Metadata Extension) ----
    let mint_key = ctx.accounts.mint.key();
    let seeds = &[SEED_CURVE, mint_key.as_ref(), &[curve_bump]];
    let signer_seeds = &[&seeds[..]];

    token_metadata_initialize(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TokenMetadataInitialize {
                program_id: ctx.accounts.token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                metadata: ctx.accounts.mint.to_account_info(), // metadata stored IN the mint
                mint_authority: ctx.accounts.bonding_curve.to_account_info(),
                update_authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ),
        name.clone(),
        symbol.clone(),
        uri,
    )?;

    // ---- Top-up mint rent after metadata realloc ----
    // token_metadata_initialize expands the mint account to store name/symbol/uri.
    // The expanded account needs more lamports for rent-exemption.
    // Without this, the runtime rejects: "account (1) with insufficient funds for rent".
    {
        let mint_info = ctx.accounts.mint.to_account_info();
        let required_rent = Rent::get()?.minimum_balance(mint_info.data_len());
        let current_lamports = mint_info.lamports();
        if current_lamports < required_rent {
            let deficit = required_rent - current_lamports;
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.creator.to_account_info(),
                        to: mint_info,
                    },
                ),
                deficit,
            )?;
        }
    }

    // ---- Initialize Human Curve™ ----
    // x₀ = D = DEPTH_RATIO × V = 20 × V (depth parameter only, no real SOL yet)
    // y₀ = 1,000,000 tokens (in base units)
    // k₀ = x₀ × y₀
    let depth = (DEPTH_RATIO as u64)
        .checked_mul(initial_liquidity)
        .ok_or(HumanofiError::MathOverflow)?;

    let x0 = depth as u128;
    let y0 = INITIAL_Y;
    let k0 = x0
        .checked_mul(y0)
        .ok_or(HumanofiError::MathOverflow)?;

    // Initial TWAP = initial spot price (P₀ = x₀ / y₀)
    let initial_twap = x0
        .checked_mul(PRICE_PRECISION)
        .ok_or(HumanofiError::MathOverflow)?
        .checked_div(y0)
        .ok_or(HumanofiError::MathOverflow)?;

    // ---- Initialize Bonding Curve PDA ----
    let curve = &mut ctx.accounts.bonding_curve;
    curve.mint = mint_key;
    curve.creator = ctx.accounts.creator.key();
    curve.x = x0;
    curve.y = y0;
    curve.k = k0;
    curve.supply_public = 0;
    curve.supply_creator = 0;
    curve.supply_protocol = 0;
    curve.sol_reserve = 0;
    curve.depth_parameter = depth;
    curve.twap_price = initial_twap;
    curve.trade_count = 0;
    curve.created_at = now;
    curve.is_active = true;
    curve.is_suspended = false;
    curve.bump = curve_bump;

    // ---- Founder Buy: Creator buys tokens at P₀ ----
    // Fee: 3% (2% protocol + 1% depth). No creator self-fee.
    let founder_result = curve.calculate_founder_buy(initial_liquidity)?;

    // ---- Transfer SOL: split between curve and treasury ----
    // Split the transfer upfront: net to curve, fee to treasury.
    // This avoids lamport manipulation on a freshly-init'd PDA
    // (which causes "sum of account balances" errors on Solana).

    // 1. Net liquidity → bonding curve PDA (sol_to_curve + fee_depth)
    let net_to_curve = founder_result.sol_to_curve
        .checked_add(founder_result.fee_depth)
        .ok_or(HumanofiError::MathOverflow)?;

    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.bonding_curve.to_account_info(),
            },
        ),
        net_to_curve,
    )?;

    // 2. Protocol fee → treasury (directly from creator, never touches the PDA)
    if founder_result.fee_protocol > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            founder_result.fee_protocol,
        )?;
    }

    // Mint Founder Buy tokens → creator ATA (frozen)
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.bonding_curve.to_account_info(),
            },
            signer_seeds,
        ),
        founder_result.tokens_creator,
    )?;

    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.creator_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.bonding_curve.to_account_info(),
        },
        signer_seeds,
    ))?;

    // Apply Founder Buy to curve state (updates x, y, k, supply, sol_reserve)
    let curve = &mut ctx.accounts.bonding_curve;
    curve.apply_founder_buy(&founder_result)?;

    // ---- Initialize Creator Vault PDA (vesting + sell limiter) ----
    let vault = &mut ctx.accounts.creator_vault;
    vault.mint = mint_key;
    vault.creator = ctx.accounts.creator.key();
    vault.created_at = now;
    vault.last_sell_at = 0;
    vault.total_sold = 0;
    vault.bump = ctx.bumps.creator_vault;

    // ---- Initialize Creator Fee Vault PDA ----
    let cfv = &mut ctx.accounts.creator_fee_vault;
    cfv.mint = mint_key;
    cfv.creator = ctx.accounts.creator.key();
    cfv.total_accumulated = 0;
    cfv.total_claimed = 0;
    cfv.last_claim_at = 0;
    cfv.created_at = now;
    cfv.bump = ctx.bumps.creator_fee_vault;

    // ---- Initialize Protocol Vault PDA ----
    // v3.6: Kept for backward compatibility but always empty (Merit removed).
    let pv = &mut ctx.accounts.protocol_vault;
    pv.mint = mint_key;
    pv.token_balance = 0;
    pv.total_accumulated = 0;
    pv.total_stabilized = 0;
    pv.total_sol_earned = 0;
    pv.bump = ctx.bumps.protocol_vault;

    msg!(
        "🚀 Token created | mint={} | creator={} | name={} | symbol={} | V={} | founder_tokens={} | sol_reserve={} | fee_protocol={}",
        mint_key,
        ctx.accounts.creator.key(),
        name,
        symbol,
        initial_liquidity,
        founder_result.tokens_creator,
        founder_result.sol_to_curve + founder_result.fee_depth,
        founder_result.fee_protocol,
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String)]
pub struct CreateToken<'info> {
    /// The creator who is launching their personal token.
    /// Pays for all account creation + initial liquidity.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The Token-2022 Mint with MetadataPointer extension.
    /// mint_authority and freeze_authority = bonding_curve PDA.
    #[account(
        init,
        payer = creator,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = bonding_curve,
        mint::freeze_authority = bonding_curve,
        mint::token_program = token_program,
        extensions::metadata_pointer::authority = bonding_curve,
        extensions::metadata_pointer::metadata_address = mint,
    )]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    /// ProtocolConfig PDA — checked for emergency freeze
    #[account(
        seeds = [SEED_CONFIG],
        bump = config.bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    /// Bonding Curve PDA — manages the token's Human Curve™ market.
    #[account(
        init,
        payer = creator,
        space = 8 + BondingCurve::INIT_SPACE,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,

    /// Creator Vault PDA — tracks vesting and sell limiter.
    #[account(
        init,
        payer = creator,
        space = 8 + CreatorVault::INIT_SPACE,
        seeds = [SEED_VAULT, mint.key().as_ref()],
        bump,
    )]
    pub creator_vault: Box<Account<'info, CreatorVault>>,

    /// Creator Fee Vault PDA — accumulates 2% of trading fees.
    #[account(
        init,
        payer = creator,
        space = 8 + CreatorFeeVault::INIT_SPACE,
        seeds = [SEED_CREATOR_FEES, mint.key().as_ref()],
        bump,
    )]
    pub creator_fee_vault: Box<Account<'info, CreatorFeeVault>>,

    /// Protocol Vault PDA — kept for backward compatibility (empty in v3.6).
    #[account(
        init,
        payer = creator,
        space = 8 + ProtocolVault::INIT_SPACE,
        seeds = [SEED_PROTOCOL_VAULT, mint.key().as_ref()],
        bump,
    )]
    pub protocol_vault: Box<Account<'info, ProtocolVault>>,

    /// Creator's token account for Founder Buy tokens (init, frozen)
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Protocol treasury wallet (receives 2% Founder Buy fee)
    /// CHECK: Validated against hardcoded TREASURY_WALLET constant
    #[account(
        mut,
        constraint = treasury.key() == TREASURY_WALLET @ HumanofiError::InvalidTreasury
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated Token Program (for creating ATAs)
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System Program
    pub system_program: Program<'info, System>,
}
