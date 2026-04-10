// ========================================
// Humanofi — Engagement Record PDA
// ========================================
//
// Tracks a holder's engagement within a creator's Inner Circle
// for a given epoch (month). Used to gate reward claims —
// holders must be ACTIVE (not just holding) to claim.
//
// Seeds: ["engagement", mint_pubkey, holder_pubkey, epoch_bytes]
// One record per holder × mint × month.

use anchor_lang::prelude::*;

use crate::constants::ENGAGEMENT_EPOCH_DURATION;

#[account]
#[derive(InitSpace)]
pub struct EngagementRecord {
    /// The Token-2022 mint this record belongs to
    pub mint: Pubkey,

    /// The holder's wallet address
    pub holder: Pubkey,

    /// Epoch number (unix_timestamp / EPOCH_DURATION)
    pub epoch: u64,

    /// Number of qualified actions this epoch
    /// (reactions, replies, votes, etc.)
    pub actions_count: u16,

    /// Last time engagement was recorded by oracle
    pub last_recorded_at: i64,

    /// PDA bump seed
    pub bump: u8,
}

/// Calculate the current epoch from a unix timestamp
pub fn current_epoch_from_timestamp(timestamp: i64) -> u64 {
    (timestamp / ENGAGEMENT_EPOCH_DURATION) as u64
}
