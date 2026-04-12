// ========================================
// Humanofi — Create Token (Token-2022 + Human Curve™)
// ========================================
//
// Creates a new personal token with:
//   - Token-2022 Mint with MetadataPointer extension
//   - Token Metadata (name, symbol, uri — visible in wallets)
//   - BondingCurve PDA initialized with Human Curve™ (x · y = k)
//   - CreatorFeeVault PDA initialized (accumulates 3% of fees)
//   - CreatorVault PDA initialized (vesting + sell limiter tracker)
//   - ProtocolVault PDA initialized (Stabilizer token treasury)
//   - Initial SOL liquidity deposited in bonding curve reserve
//
// IMPORTANT: No tokens are minted at creation!
// The creator's tokens arrive progressively via the Merit Reward
// mechanism (10% of each buy). Protocol gets 4%.
//
// x₀ = 21 × V (D = 20×V depth parameter + V real SOL)
// freeze_authority = bonding_curve PDA → tokens only tradable on Humanofi.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        token_metadata_initialize, Mint, TokenInterface, TokenMetadataInitialize,
    },
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

/// Creates a new personal token with the Human Curve™.
///
/// # Initialization (Depth Parameter D)
///   x₀ = DEPTH_TOTAL_MULTIPLIER × V (21 × V)
///   D  = DEPTH_RATIO × V             (20 × V, mathematical, not real SOL)
///   y₀ = INITIAL_Y (1,000,000 × 10^6)
///   k₀ = x₀ × y₀
///   P₀ = x₀ / y₀ = 21V / 10^12
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

    // ---- Transfer initial liquidity: creator → bonding curve PDA ----
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.bonding_curve.to_account_info(),
            },
        ),
        initial_liquidity,
    )?;

    // ---- Initialize Human Curve™ ----
    // x₀ = DEPTH_TOTAL_MULTIPLIER × V = 21 × V
    //   where D = DEPTH_RATIO × V = 20 × V is a depth parameter (not real SOL)
    //   and   V = initial_liquidity (real SOL in vault)
    // y₀ = 1,000,000 tokens (in base units)
    // k₀ = x₀ × y₀
    let x0 = (DEPTH_TOTAL_MULTIPLIER as u128)
        .checked_mul(initial_liquidity as u128)
        .ok_or(HumanofiError::MathOverflow)?;
    let y0 = INITIAL_Y;
    let k0 = x0
        .checked_mul(y0)
        .ok_or(HumanofiError::MathOverflow)?;

    let depth = (DEPTH_RATIO as u64)
        .checked_mul(initial_liquidity)
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
    curve.sol_reserve = initial_liquidity; // Only real SOL
    curve.depth_parameter = depth;         // D = 20 × V (mathematical, not withdrawable)
    curve.twap_price = initial_twap;
    curve.trade_count = 0;
    curve.created_at = now;
    curve.is_active = true;
    curve.bump = curve_bump;

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
    let pv = &mut ctx.accounts.protocol_vault;
    pv.mint = mint_key;
    pv.token_balance = 0;
    pv.total_accumulated = 0;
    pv.total_stabilized = 0;
    pv.total_sol_earned = 0;
    pv.bump = ctx.bumps.protocol_vault;

    msg!(
        "🚀 Token created | mint={} | creator={} | name={} | symbol={} | V={} | x₀={} | y₀={} | k₀={} | P₀={}",
        mint_key,
        ctx.accounts.creator.key(),
        name,
        symbol,
        initial_liquidity,
        x0,
        y0,
        k0,
        x0 / y0
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

    /// Creator Fee Vault PDA — accumulates 3% of trading fees.
    #[account(
        init,
        payer = creator,
        space = 8 + CreatorFeeVault::INIT_SPACE,
        seeds = [SEED_CREATOR_FEES, mint.key().as_ref()],
        bump,
    )]
    pub creator_fee_vault: Box<Account<'info, CreatorFeeVault>>,

    /// Protocol Vault PDA — holds protocol's Merit Fee tokens.
    #[account(
        init,
        payer = creator,
        space = 8 + ProtocolVault::INIT_SPACE,
        seeds = [SEED_PROTOCOL_VAULT, mint.key().as_ref()],
        bump,
    )]
    pub protocol_vault: Box<Account<'info, ProtocolVault>>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated Token Program (for creating ATAs)
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System Program
    pub system_program: Program<'info, System>,
}
