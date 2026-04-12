// ========================================
// Humanofi — Protocol Vault PDA
// ========================================
//
// v3.6: LEGACY — This vault is no longer actively used.
//
// Previously held the protocol's token treasury for each mint.
// Tokens accumulated via the 4% Merit Fee on each buy (v2).
// The Price Stabilizer sold from this vault to smooth price spikes.
//
// In v3.6, Merit Reward is removed. This vault is initialized
// empty at token creation and kept for backward compatibility.
// The future bidirectional market maker may reuse this account.
//
// Seeds: ["protocol_vault", mint_pubkey]

use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ProtocolVault {
    /// The Token-2022 mint this vault is associated with
    pub mint: Pubkey,

    /// Current token balance in the vault (always 0 in v3.6)
    pub token_balance: u64,

    /// Total tokens ever accumulated (always 0 in v3.6)
    pub total_accumulated: u64,

    /// Total tokens ever sold by the Stabilizer (always 0 in v3.6)
    pub total_stabilized: u64,

    /// Total SOL earned by stabilization (lamports, always 0 in v3.6)
    pub total_sol_earned: u64,

    /// PDA bump seed
    pub bump: u8,
}
