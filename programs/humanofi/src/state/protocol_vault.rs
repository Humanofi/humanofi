// ========================================
// Humanofi — Protocol Vault PDA
// ========================================
//
// Holds the protocol's token treasury for each mint.
// Tokens accumulate via the 1.4% Merit Fee on each buy.
// The Price Stabilizer sells from this vault to smooth price spikes.
//
// Seeds: ["protocol_vault", mint_pubkey]

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProtocolVault {
    /// The Token-2022 mint this vault is associated with
    pub mint: Pubkey,

    /// Current token balance in the vault (base units)
    pub token_balance: u64,

    /// Total tokens ever accumulated via Merit Fee (historical)
    pub total_accumulated: u64,

    /// Total tokens ever sold by the Stabilizer (historical)
    pub total_stabilized: u64,

    /// Total SOL earned by stabilization (lamports, historical)
    pub total_sol_earned: u64,

    /// PDA bump seed
    pub bump: u8,
}
