// ========================================
// Humanofi — Create Token (Token-2022 + Metadata)
// ========================================
//
// Creates a new personal token with:
// - Token-2022 Mint with MetadataPointer extension
// - Token Metadata (name, symbol, uri — visible in wallets)
// - BondingCurve PDA initialized
// - RewardPool PDA initialized
// - CreatorVault PDA initialized
// - Creator's allocation minted and FROZEN
// - Initial liquidity deposited in bonding curve
//
// The freeze_authority mechanism ensures tokens can
// only be traded through the Humanofi program.
// All token accounts are frozen after minting.
// Only our program (as freeze_authority) can thaw them.

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{
        freeze_account, mint_to, token_metadata_initialize, FreezeAccount, Mint, MintTo,
        TokenAccount, TokenInterface, TokenMetadataInitialize,
    },
};

use crate::constants::*;
use crate::errors::HumanofiError;
use crate::state::*;

/// Creates a new personal token with all associated PDAs + on-chain metadata.
///
/// # Flow
/// 1. Validate inputs (name, symbol, prices, liquidity)
/// 2. Initialize Token-2022 Mint with MetadataPointer extension
/// 3. Initialize on-chain metadata (name, symbol, uri)
/// 4. Transfer initial liquidity SOL to bonding curve reserve
/// 5. Initialize BondingCurve, RewardPool, CreatorVault PDAs
/// 6. Create creator's token account (ATA)
/// 7. Mint creator's share to their ATA
/// 8. Freeze creator's ATA (tokens locked)
pub fn handler(
    ctx: Context<CreateToken>,
    name: String,
    symbol: String,
    uri: String,
    base_price: u64,
    slope: u64,
    initial_liquidity: u64,
) -> Result<()> {
    // ---- Validate inputs ----
    require!(base_price > 0, HumanofiError::InvalidBasePrice);
    require!(slope > 0, HumanofiError::InvalidCurveFactor);
    require!(initial_liquidity >= MIN_INITIAL_LIQUIDITY, HumanofiError::InsufficientInitialLiquidity);
    require!(initial_liquidity <= MAX_INITIAL_LIQUIDITY, HumanofiError::ExcessiveInitialLiquidity);
    require!(!name.is_empty() && name.len() <= 32, HumanofiError::InvalidTokenName);
    require!(!symbol.is_empty() && symbol.len() <= 10, HumanofiError::InvalidTokenSymbol);

    let clock = Clock::get()?;
    let now = clock.unix_timestamp;
    let curve_bump = ctx.bumps.bonding_curve;

    // ---- Initialize on-chain metadata (Token-2022 Metadata Extension) ----
    // This makes name, symbol, and image visible in Phantom, Solflare, etc.
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

    // ---- Transfer initial liquidity: creator → bonding curve PDA ----
    if initial_liquidity > 0 {
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
    }

    // ---- Initialize Bonding Curve PDA ----
    let curve = &mut ctx.accounts.bonding_curve;
    curve.mint = ctx.accounts.mint.key();
    curve.creator = ctx.accounts.creator.key();
    curve.base_price = base_price;
    curve.slope = slope;
    curve.supply_sold = 0;
    curve.sol_reserve = initial_liquidity;
    curve.created_at = now;
    curve.is_active = true;
    curve.bump = curve_bump;

    // ---- Initialize Creator Vault PDA (progressive vesting) ----
    let vault = &mut ctx.accounts.creator_vault;
    vault.mint = ctx.accounts.mint.key();
    vault.creator = ctx.accounts.creator.key();
    vault.original_allocation = CREATOR_INITIAL_SUPPLY;
    vault.total_unlocked = 0;
    vault.created_at = now;
    vault.bump = ctx.bumps.creator_vault;

    // ---- Initialize Reward Pool PDA ----
    let pool = &mut ctx.accounts.reward_pool;
    pool.mint = ctx.accounts.mint.key();
    pool.reward_per_token_stored = 0;
    pool.total_accumulated = 0;
    pool.total_distributed = 0;
    pool.last_updated_at = now;
    pool.bump = ctx.bumps.reward_pool;

    // ---- Mint creator's share to their ATA ----
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
        CREATOR_INITIAL_SUPPLY,
    )?;

    // ---- Freeze creator's ATA (lock) ----
    freeze_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        FreezeAccount {
            account: ctx.accounts.creator_token_account.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.bonding_curve.to_account_info(),
        },
        signer_seeds,
    ))?;

    msg!(
        "Token created | mint={} | creator={} | name={} | symbol={} | initial_liquidity={}",
        ctx.accounts.mint.key(),
        ctx.accounts.creator.key(),
        name,
        symbol,
        initial_liquidity
    );

    Ok(())
}

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String)]
pub struct CreateToken<'info> {
    /// The creator who is launching their personal token.
    /// Pays for all account creation.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The Token-2022 Mint with MetadataPointer extension.
    /// mint_authority and freeze_authority = bonding_curve PDA.
    /// The metadata pointer points to the mint itself (embedded metadata).
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

    /// Bonding Curve PDA — manages the token's market.
    /// Also serves as mint_authority and freeze_authority.
    #[account(
        init,
        payer = creator,
        space = 8 + BondingCurve::INIT_SPACE,
        seeds = [SEED_CURVE, mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve: Box<Account<'info, BondingCurve>>,

    /// Creator Vault PDA — tracks the locked token allocation.
    #[account(
        init,
        payer = creator,
        space = 8 + CreatorVault::INIT_SPACE,
        seeds = [SEED_VAULT, mint.key().as_ref()],
        bump,
    )]
    pub creator_vault: Box<Account<'info, CreatorVault>>,

    /// Reward Pool PDA — accumulates holder fees.
    #[account(
        init,
        payer = creator,
        space = 8 + RewardPool::INIT_SPACE,
        seeds = [SEED_REWARDS, mint.key().as_ref()],
        bump,
    )]
    pub reward_pool: Box<Account<'info, RewardPool>>,

    /// Creator's Associated Token Account for this mint.
    /// Created automatically. Will be frozen after minting.
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Token-2022 program
    pub token_program: Interface<'info, TokenInterface>,

    /// Associated Token Program (for creating ATAs)
    pub associated_token_program: Program<'info, AssociatedToken>,

    /// System Program
    pub system_program: Program<'info, System>,
}
