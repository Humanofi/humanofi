-- ================================================
-- Migration 009: Add is_archived column to inner_circle_posts
-- ================================================

ALTER TABLE inner_circle_posts
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Index for filtering archived posts
CREATE INDEX IF NOT EXISTS idx_inner_circle_posts_archived
  ON inner_circle_posts (creator_mint, is_archived);
