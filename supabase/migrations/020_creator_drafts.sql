-- ========================================
-- Humanofi — Creator Drafts + Category Alignment
-- Migration: 019_creator_drafts
-- ========================================
-- 1. Updates category CHECK to include new categories
-- 2. Creates creator_drafts table for auto-saving creation progress


-- ── 1. Update category constraint with new categories ──

ALTER TABLE creator_tokens DROP CONSTRAINT IF EXISTS creator_tokens_category_check;

ALTER TABLE creator_tokens ADD CONSTRAINT creator_tokens_category_check
  CHECK (category IN (
    'trader', 'entrepreneur', 'investor', 'artist',
    'researcher', 'creator', 'thinker', 'other',
    'founder', 'dev', 'developer', 'musician', 'designer', 'activist',
    'athlete', 'influencer', 'writer', 'filmmaker', 'photographer',
    'educator', 'chef', 'streamer', 'engineer', 'scientist', 'journalist',
    -- New categories (v3.8)
    'doctor', 'lawyer', 'podcaster', 'vlogger', 'coach', 'author', 'diplomat'
  ));


-- ── 2. Creator Drafts table ──
CREATE TABLE IF NOT EXISTS creator_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  TEXT NOT NULL UNIQUE,
  
  -- Form fields
  token_name      TEXT DEFAULT '',
  token_symbol    TEXT DEFAULT '',
  category        TEXT DEFAULT '',
  bio             TEXT DEFAULT '',
  story           TEXT DEFAULT '',
  offer           TEXT DEFAULT '',
  country         TEXT DEFAULT '',
  twitter         TEXT DEFAULT '',
  linkedin        TEXT DEFAULT '',
  website         TEXT DEFAULT '',
  instagram       TEXT DEFAULT '',
  avatar_url      TEXT,
  initial_liquidity_usd INTEGER DEFAULT 20,
  current_section INTEGER DEFAULT 0,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drafts_wallet ON creator_drafts(wallet_address);

-- RLS
ALTER TABLE creator_drafts ENABLE ROW LEVEL SECURITY;

-- Anyone can read their own draft
CREATE POLICY "Users can read own draft"
  ON creator_drafts FOR SELECT
  USING (true);

-- Anyone can insert their own draft  
CREATE POLICY "Users can insert own draft"
  ON creator_drafts FOR INSERT
  WITH CHECK (true);

-- Anyone can update their own draft
CREATE POLICY "Users can update own draft"
  ON creator_drafts FOR UPDATE
  USING (true);

-- Anyone can delete their own draft
CREATE POLICY "Users can delete own draft"
  ON creator_drafts FOR DELETE
  USING (true);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS set_updated_at_drafts ON creator_drafts;
CREATE TRIGGER set_updated_at_drafts
  BEFORE UPDATE ON creator_drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
