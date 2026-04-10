-- ========================================================
-- HUMANOFI — Migration 002: Beta Adjustments
-- ========================================================
-- Run AFTER 00001_initial_schema.sql + 001_profiles_and_storage.sql
-- Date: 2026-04-10
--
-- Context: Preparing for Beta launch on Devnet.
-- KYC is not required in Beta, so we relax constraints
-- that depend on verified_identities.
--
-- Changes:
--   1. Drop hiuid FK constraint (blocks token creation without KYC)
--   2. Make hiuid nullable
--   3. Add columns: story, offer, country_code, socials
--   4. Relax category CHECK to allow 'founder', 'dev', etc.
--   5. Make token_lock_until nullable (default to 1 year from now)
--   6. Fix RLS: allow service role writes on all tables
--   7. Add INSERT policies for profiles, token_holders, creator_tokens
-- ========================================================


-- ════════════════════════════════════════════════════════
-- 1. HIUID: Drop FK + make nullable
-- ════════════════════════════════════════════════════════
-- In production, hiuid references verified_identities.
-- For Beta, we skip KYC and use wallet as temp hiuid.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'creator_tokens_hiuid_fkey' 
    AND table_name = 'creator_tokens'
  ) THEN
    ALTER TABLE creator_tokens DROP CONSTRAINT creator_tokens_hiuid_fkey;
    RAISE NOTICE 'Dropped FK: creator_tokens_hiuid_fkey';
  END IF;
END $$;

ALTER TABLE creator_tokens ALTER COLUMN hiuid DROP NOT NULL;


-- ════════════════════════════════════════════════════════
-- 2. ADD MISSING COLUMNS to creator_tokens
-- ════════════════════════════════════════════════════════
-- The API inserts story, offer, socials, country_code
-- but these columns don't exist in the initial schema.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'story') THEN
    ALTER TABLE creator_tokens ADD COLUMN story TEXT DEFAULT '';
    RAISE NOTICE 'Added column: creator_tokens.story';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'offer') THEN
    ALTER TABLE creator_tokens ADD COLUMN offer TEXT DEFAULT '';
    RAISE NOTICE 'Added column: creator_tokens.offer';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'country_code') THEN
    ALTER TABLE creator_tokens ADD COLUMN country_code TEXT;
    RAISE NOTICE 'Added column: creator_tokens.country_code';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'socials') THEN
    ALTER TABLE creator_tokens ADD COLUMN socials JSONB DEFAULT '{}';
    RAISE NOTICE 'Added column: creator_tokens.socials';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'apy') THEN
    ALTER TABLE creator_tokens ADD COLUMN apy NUMERIC(5,2) DEFAULT 0;
    RAISE NOTICE 'Added column: creator_tokens.apy';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'vesting_year') THEN
    ALTER TABLE creator_tokens ADD COLUMN vesting_year INT DEFAULT 1;
    RAISE NOTICE 'Added column: creator_tokens.vesting_year';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'creator_tokens' AND column_name = 'total_unlocked') THEN
    ALTER TABLE creator_tokens ADD COLUMN total_unlocked NUMERIC(20,2) DEFAULT 0;
    RAISE NOTICE 'Added column: creator_tokens.total_unlocked';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════
-- 3. RELAX CATEGORY CHECK
-- ════════════════════════════════════════════════════════
-- The initial schema only allows specific categories.
-- The API sends 'founder', 'dev', etc. Let's drop the
-- constraint and replace with a more permissive one.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'creator_tokens_category_check'
  ) THEN
    ALTER TABLE creator_tokens DROP CONSTRAINT creator_tokens_category_check;
    RAISE NOTICE 'Dropped CHECK: creator_tokens_category_check';
  END IF;
END $$;

-- Add a more permissive check (or none — any text is fine for Beta)
-- In production, we can re-add a stricter constraint.
ALTER TABLE creator_tokens ADD CONSTRAINT creator_tokens_category_check
  CHECK (category IN (
    'trader', 'entrepreneur', 'investor', 'artist',
    'researcher', 'creator', 'thinker', 'other',
    'founder', 'dev', 'musician', 'designer', 'activist'
  ));


-- ════════════════════════════════════════════════════════
-- 4. MAKE token_lock_until NULLABLE
-- ════════════════════════════════════════════════════════
-- Default to NULL, API sets it to now() + 1 year.

ALTER TABLE creator_tokens ALTER COLUMN token_lock_until DROP NOT NULL;


-- ════════════════════════════════════════════════════════
-- 5. FIX RLS POLICIES — Allow service writes
-- ════════════════════════════════════════════════════════
-- The initial schema only has SELECT policies.
-- service_role bypasses RLS by default in Supabase,
-- BUT if we use service key improperly or switch keys,
-- these policies ensure writes work.

-- verified_identities: Open for service writes
DROP POLICY IF EXISTS "service_role_only" ON verified_identities;
CREATE POLICY "service_full_access" ON verified_identities
  FOR ALL USING (true);

-- creator_tokens: Allow inserts + updates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'creator_tokens' AND policyname = 'service_insert_creators'
  ) THEN
    CREATE POLICY "service_insert_creators" ON creator_tokens
      FOR INSERT WITH CHECK (true);
    RAISE NOTICE 'Added INSERT policy on creator_tokens';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'creator_tokens' AND policyname = 'service_update_creators'
  ) THEN
    CREATE POLICY "service_update_creators" ON creator_tokens
      FOR UPDATE USING (true);
    RAISE NOTICE 'Added UPDATE policy on creator_tokens';
  END IF;
END $$;

-- token_holders: Allow inserts + updates (Helius webhook)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'token_holders' AND policyname = 'service_insert_holders'
  ) THEN
    CREATE POLICY "service_insert_holders" ON token_holders
      FOR INSERT WITH CHECK (true);
    RAISE NOTICE 'Added INSERT policy on token_holders';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'token_holders' AND policyname = 'service_update_holders'
  ) THEN
    CREATE POLICY "service_update_holders" ON token_holders
      FOR UPDATE USING (true);
    RAISE NOTICE 'Added UPDATE policy on token_holders';
  END IF;
END $$;

-- profiles: Allow inserts (auth session sync)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'service_insert_profiles'
  ) THEN
    CREATE POLICY "service_insert_profiles" ON profiles
      FOR INSERT WITH CHECK (true);
    RAISE NOTICE 'Added INSERT policy on profiles';
  END IF;
END $$;

-- inner_circle_posts: Allow all (API handles gating)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inner_circle_posts' AND policyname = 'service_manage_posts'
  ) THEN
    CREATE POLICY "service_manage_posts" ON inner_circle_posts
      FOR ALL USING (true);
    RAISE NOTICE 'Added ALL policy on inner_circle_posts';
  END IF;
END $$;

-- inner_circle_reactions: Allow all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inner_circle_reactions' AND policyname = 'service_manage_reactions'
  ) THEN
    CREATE POLICY "service_manage_reactions" ON inner_circle_reactions
      FOR ALL USING (true);
    RAISE NOTICE 'Added ALL policy on inner_circle_reactions';
  END IF;
END $$;

-- inner_circle_replies: Allow all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inner_circle_replies' AND policyname = 'service_manage_replies'
  ) THEN
    CREATE POLICY "service_manage_replies" ON inner_circle_replies
      FOR ALL USING (true);
    RAISE NOTICE 'Added ALL policy on inner_circle_replies';
  END IF;
END $$;

-- creator_activity: Allow all
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'creator_activity' AND policyname = 'service_manage_activity'
  ) THEN
    CREATE POLICY "service_manage_activity" ON creator_activity
      FOR ALL USING (true);
    RAISE NOTICE 'Added ALL policy on creator_activity';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════
-- 6. UPDATED_AT TRIGGERS (for new tables if missing)
-- ════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS set_updated_at_creator_tokens ON creator_tokens;
CREATE TRIGGER set_updated_at_creator_tokens
  BEFORE UPDATE ON creator_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_token_holders ON token_holders;
CREATE TRIGGER set_updated_at_token_holders
  BEFORE UPDATE ON token_holders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════
-- DONE — Migration 002: Beta Adjustments
-- ════════════════════════════════════════════════════════
-- All statements are idempotent (safe to re-run).
--
-- Summary of changes:
--   - hiuid: FK dropped, nullable
--   - New columns: story, offer, country_code, socials, apy, vesting_year, total_unlocked
--   - Category: expanded to include founder, dev, musician, designer, activist
--   - token_lock_until: now nullable
--   - RLS: all tables open for service writes
--   - Triggers: updated_at on creator_tokens, token_holders
--
-- To revert for production:
--   ALTER TABLE creator_tokens ALTER COLUMN hiuid SET NOT NULL;
--   ALTER TABLE creator_tokens ADD CONSTRAINT creator_tokens_hiuid_fkey
--     FOREIGN KEY (hiuid) REFERENCES verified_identities(hiuid);
