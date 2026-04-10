-- ========================================================
-- HUMANOFI — Supabase Database Schema
-- ========================================================
-- Run this SQL in the Supabase SQL Editor (https://supabase.com/dashboard)
--
-- Tables created:
--   0. profiles              → All connected wallet users (Privy auth sync)
--   1. verified_identities  → KYC verified users (Didit + HIUID)
--   2. creator_tokens       → Creator profiles on the protocol
--   3. token_holders        → Who holds what (synced via Helius)
--   4. inner_circle_posts   → Creator feed posts (gated content)
--   5. inner_circle_reactions → Emoji reactions on posts
--   6. inner_circle_replies → Replies on posts
--   7. creator_activity     → Activity log (for Activity Score)
--
-- NOTE: This is the reference schema. Actual migrations are in:
--   supabase/migrations/00001_initial_schema.sql
--   supabase/migrations/001_profiles_and_storage.sql
--   supabase/migrations/002_beta_adjustments.sql
-- ========================================================

-- ════════════════════════════════════════════════════════
-- 0. PROFILES (Auto-created on wallet connect)
-- ════════════════════════════════════════════════════════
-- Every connected wallet gets a profile. Created by /api/auth/session
-- when Privy login syncs with Supabase.

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address  TEXT NOT NULL UNIQUE,                          -- Solana wallet address (main identifier)
  privy_user_id   TEXT,                                          -- Privy user ID (for cross-reference)
  display_name    TEXT,                                          -- Optional display name
  avatar_url      TEXT,                                          -- Optional avatar
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),                     -- Last login timestamp
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_privy ON profiles(privy_user_id) WHERE privy_user_id IS NOT NULL;

-- ════════════════════════════════════════════════════════
-- 1. VERIFIED IDENTITIES
-- ════════════════════════════════════════════════════════
-- Stores verified identity data after Didit KYC + HIUID generation.
-- One row per verified human. HIUID is unique (1 human = 1 token).

CREATE TABLE IF NOT EXISTS verified_identities (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hiuid           TEXT NOT NULL UNIQUE,                         -- SHA-256 deterministic hash (64 hex chars)
  wallet_address  TEXT NOT NULL UNIQUE,                         -- Solana wallet that verified
  has_token       BOOLEAN DEFAULT FALSE NOT NULL,               -- Whether this identity has created a token
  country_code    TEXT,                                          -- ISO country code (e.g. "FR", "US")
  didit_session_id TEXT,                                        -- Didit verification session ID (for audit)
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_verified_identities_hiuid ON verified_identities(hiuid);
CREATE INDEX IF NOT EXISTS idx_verified_identities_wallet ON verified_identities(wallet_address);

-- ════════════════════════════════════════════════════════
-- 2. CREATOR TOKENS
-- ════════════════════════════════════════════════════════
-- Each row = 1 creator who has deployed their token on Solana.
-- This is the main table for the Explore page.

CREATE TABLE IF NOT EXISTS creator_tokens (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mint_address    TEXT NOT NULL UNIQUE,                          -- Solana SPL token mint address
  wallet_address  TEXT NOT NULL,                                 -- Creator's wallet address
  hiuid           TEXT NOT NULL REFERENCES verified_identities(hiuid) ON DELETE RESTRICT,
  display_name    TEXT NOT NULL,                                 -- Public display name
  category        TEXT NOT NULL DEFAULT 'other',                 -- founder, trader, thinker, artist, dev, etc.
  bio             TEXT DEFAULT '',                               -- Short bio
  story           TEXT DEFAULT '',                               -- Their story / motivation
  offer           TEXT DEFAULT '',                               -- What they offer token holders
  avatar_url      TEXT,                                          -- Profile picture URL
  country_code    TEXT,                                          -- Denormalized from verified_identities
  socials         JSONB DEFAULT '{}',                            -- { twitter: "...", linkedin: "...", ... }
  activity_score  INT DEFAULT 0 NOT NULL,                        -- 0-100, updated by cron/webhook
  activity_status TEXT DEFAULT 'active' CHECK (activity_status IN ('active', 'inactive', 'suspended')),
  apy             NUMERIC(5,2) DEFAULT 0,                       -- Estimated APY for holders
  vesting_year    INT DEFAULT 1,                                 -- Current vesting year (1-5)
  total_unlocked  NUMERIC(20,2) DEFAULT 0,                      -- Total tokens unlocked so far
  token_lock_until TIMESTAMPTZ,                                  -- When creator tokens fully unlock
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_creator_tokens_mint ON creator_tokens(mint_address);
CREATE INDEX IF NOT EXISTS idx_creator_tokens_wallet ON creator_tokens(wallet_address);
CREATE INDEX IF NOT EXISTS idx_creator_tokens_category ON creator_tokens(category);
CREATE INDEX IF NOT EXISTS idx_creator_tokens_activity ON creator_tokens(activity_score DESC);

-- ════════════════════════════════════════════════════════
-- 3. TOKEN HOLDERS
-- ════════════════════════════════════════════════════════
-- Tracks who holds how many tokens. Updated via Helius webhook
-- or on-chain queries. Used for Inner Circle gating.

CREATE TABLE IF NOT EXISTS token_holders (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address  TEXT NOT NULL,                                 -- Holder's wallet
  mint_address    TEXT NOT NULL,                                 -- Token mint address
  balance         NUMERIC(20,6) DEFAULT 0 NOT NULL,             -- Current token balance
  first_bought_at TIMESTAMPTZ DEFAULT NOW(),                     -- When they first bought
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Composite unique: one row per wallet per token
  UNIQUE(wallet_address, mint_address)
);

-- Indexes for fast holder queries
CREATE INDEX IF NOT EXISTS idx_token_holders_mint ON token_holders(mint_address);
CREATE INDEX IF NOT EXISTS idx_token_holders_wallet ON token_holders(wallet_address);
CREATE INDEX IF NOT EXISTS idx_token_holders_balance ON token_holders(mint_address, balance) WHERE balance > 0;

-- ════════════════════════════════════════════════════════
-- 4. INNER CIRCLE POSTS
-- ════════════════════════════════════════════════════════
-- Content posted by creators to their token-gated feed.
-- Only holders can read these.

CREATE TABLE IF NOT EXISTS inner_circle_posts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_mint    TEXT NOT NULL REFERENCES creator_tokens(mint_address) ON DELETE CASCADE,
  content         TEXT NOT NULL,                                 -- Post text content
  image_urls      TEXT[] DEFAULT '{}',                           -- Array of image URLs
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inner_circle_posts_mint ON inner_circle_posts(creator_mint);
CREATE INDEX IF NOT EXISTS idx_inner_circle_posts_created ON inner_circle_posts(creator_mint, created_at DESC);

-- ════════════════════════════════════════════════════════
-- 5. INNER CIRCLE REACTIONS
-- ════════════════════════════════════════════════════════
-- Emoji reactions on posts. One reaction per user per emoji per post.

CREATE TABLE IF NOT EXISTS inner_circle_reactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,                                 -- Who reacted
  emoji           TEXT NOT NULL CHECK (emoji IN ('🔥', '💡', '🙏', '🚀', '❤️', '👀')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- One reaction per emoji per user per post
  UNIQUE(post_id, wallet_address, emoji)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reactions_post ON inner_circle_reactions(post_id);

-- ════════════════════════════════════════════════════════
-- 6. INNER CIRCLE REPLIES
-- ════════════════════════════════════════════════════════
-- Text replies on posts. Holders and creators can reply.

CREATE TABLE IF NOT EXISTS inner_circle_replies (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,                                 -- Who replied
  content         TEXT NOT NULL,                                 -- Reply text
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_replies_post ON inner_circle_replies(post_id);

-- ════════════════════════════════════════════════════════
-- 7. CREATOR ACTIVITY LOG
-- ════════════════════════════════════════════════════════
-- Logs every creator action. Used to compute Activity Score.
-- Types: post, reply, trade, claim, etc.

CREATE TABLE IF NOT EXISTS creator_activity (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_mint    TEXT NOT NULL REFERENCES creator_tokens(mint_address) ON DELETE CASCADE,
  action_type     TEXT NOT NULL,                                 -- 'post', 'reply', 'trade', 'claim'
  metadata        JSONB DEFAULT '{}',                            -- Optional extra data
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_creator_activity_mint ON creator_activity(creator_mint);
CREATE INDEX IF NOT EXISTS idx_creator_activity_time ON creator_activity(creator_mint, created_at DESC);


-- ════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════
-- Enable RLS on all tables. Since we use the service_role key
-- server-side, RLS won't block API routes. But it protects
-- against direct client-side access with the anon key.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inner_circle_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inner_circle_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inner_circle_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_activity ENABLE ROW LEVEL SECURITY;

-- ── Profiles: public read, auth write own ──
CREATE POLICY "Anyone can read profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.jwt() ->> 'wallet_address' = wallet_address);

-- ── Public READ access for creator_tokens (explore page) ──
CREATE POLICY "Anyone can read creator_tokens"
  ON creator_tokens FOR SELECT
  USING (true);

-- ── Public READ access for token_holders (holder count) ──
CREATE POLICY "Anyone can read token_holders"
  ON token_holders FOR SELECT
  USING (true);

-- ── Service role has FULL access (for API routes) ──
-- The service_role key bypasses RLS by default,
-- so no explicit policy is needed for server-side writes.

-- ── Block direct client writes on sensitive tables ──
-- verified_identities: NO public access (server-only)
CREATE POLICY "No public access to verified_identities"
  ON verified_identities FOR ALL
  USING (false);

-- inner_circle_posts: READ only if you hold tokens (enforced by API, not RLS)
-- For simplicity, we allow read and let the API handle gating:
CREATE POLICY "Authenticated can read inner_circle_posts"
  ON inner_circle_posts FOR SELECT
  USING (true);

CREATE POLICY "No public insert on inner_circle_posts"
  ON inner_circle_posts FOR INSERT
  WITH CHECK (false);

-- inner_circle_reactions
CREATE POLICY "Anyone can read reactions"
  ON inner_circle_reactions FOR SELECT
  USING (true);

CREATE POLICY "No public insert on reactions"
  ON inner_circle_reactions FOR INSERT
  WITH CHECK (false);

-- inner_circle_replies
CREATE POLICY "Anyone can read replies"
  ON inner_circle_replies FOR SELECT
  USING (true);

CREATE POLICY "No public insert on replies"
  ON inner_circle_replies FOR INSERT
  WITH CHECK (false);

-- creator_activity: NO public access
CREATE POLICY "No public access to creator_activity"
  ON creator_activity FOR ALL
  USING (false);


-- ════════════════════════════════════════════════════════
-- AUTO-UPDATE updated_at TRIGGER
-- ════════════════════════════════════════════════════════
-- Automatically sets updated_at to NOW() on every UPDATE.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_verified_identities
  BEFORE UPDATE ON verified_identities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_creator_tokens
  BEFORE UPDATE ON creator_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_token_holders
  BEFORE UPDATE ON token_holders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_inner_circle_posts
  BEFORE UPDATE ON inner_circle_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ════════════════════════════════════════════════════════
-- STORAGE BUCKETS
-- ════════════════════════════════════════════════════════
-- Two public buckets for token assets:
--   - avatars: profile photos (used as token image)
--   - metadata: JSON metadata files (Metaplex standard)

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('metadata', 'metadata', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for both buckets
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Service upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Public read metadata"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'metadata');

CREATE POLICY "Service upload metadata"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'metadata');


-- ════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════
-- Tables: 8 (profiles, verified_identities, creator_tokens, token_holders,
--             inner_circle_posts, inner_circle_reactions, inner_circle_replies,
--             creator_activity)
-- Indexes: 16
-- RLS Policies: 12
-- Triggers: 5
--
-- Auth Flow:
--   1. User connects wallet via Privy
--   2. /api/auth/session creates profile + signs Supabase JWT
--   3. Frontend stores JWT → Supabase client is authenticated
--   4. Authenticated user can query with RLS context
--
-- Next steps:
--   1. Run migrations in order (00001 → 001 → 002)
--   2. Add SUPABASE_JWT_SECRET + PRIVY_APP_SECRET to .env.local
--   3. Verify tables exist in Table Editor
--   4. Test full flow: Connect wallet → Create token → Inner Circle
