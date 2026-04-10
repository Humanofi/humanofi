-- ========================================
-- Humanofi — Migration 008: Fix constraints + security hardening
-- ========================================

-- 1. Fix inner_circle_reactions UNIQUE constraint
--    Old: UNIQUE(post_id, wallet_address, emoji) → allowed multiple reactions per user
--    New: UNIQUE(post_id, wallet_address) → enforces 1 reaction per user per post

-- First remove ALL existing duplicate reactions (keep the latest one)
DELETE FROM inner_circle_reactions a
USING inner_circle_reactions b
WHERE a.post_id = b.post_id
  AND a.wallet_address = b.wallet_address
  AND a.created_at < b.created_at;

-- Drop old constraint (may have different names depending on migration order)
ALTER TABLE inner_circle_reactions
  DROP CONSTRAINT IF EXISTS inner_circle_reactions_post_id_wallet_address_emoji_key;

-- Add correct constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'inner_circle_reactions'::regclass
    AND contype = 'u'
    AND conname = 'inner_circle_reactions_post_wallet_unique'
  ) THEN
    ALTER TABLE inner_circle_reactions
      ADD CONSTRAINT inner_circle_reactions_post_wallet_unique UNIQUE(post_id, wallet_address);
    RAISE NOTICE 'Added UNIQUE(post_id, wallet_address) constraint';
  END IF;
END $$;

-- 2. Add missing post_type values to inner_circle_posts CHECK (if exists)
-- No check constraint currently, but ensure metadata validation via app layer.

-- 3. Add index for questions by answered status (creator dashboard)
CREATE INDEX IF NOT EXISTS idx_questions_answered ON inner_circle_questions(post_id, answered_at)
  WHERE answered_at IS NOT NULL;
