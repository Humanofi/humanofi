-- ========================================================
-- HUMANOFI — Migration: Beta Adjustments
-- ========================================================
-- Run AFTER schema.sql in the Supabase SQL Editor.
--
-- Changes:
--   1. Remove hiuid FK constraint (Beta: no KYC required)
--   2. Make hiuid nullable (Beta: use wallet as temp hiuid)
--   3. Allow service_role to insert into all tables
--   4. Add missing wallet_address unique constraint
-- ========================================================

-- ════════════════════════════════════════════════════════
-- 1. REMOVE HIUID FOREIGN KEY (Beta — no KYC required)
-- ════════════════════════════════════════════════════════
-- In production, hiuid references verified_identities.
-- For Beta (devnet), we skip KYC and use wallet as temp hiuid.
-- This FK would block all token creation without KYC.

DO $$
BEGIN
  -- Drop the FK constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'creator_tokens_hiuid_fkey' 
    AND table_name = 'creator_tokens'
  ) THEN
    ALTER TABLE creator_tokens DROP CONSTRAINT creator_tokens_hiuid_fkey;
    RAISE NOTICE 'Dropped FK: creator_tokens_hiuid_fkey';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════
-- 2. MAKE HIUID NULLABLE (Beta)
-- ════════════════════════════════════════════════════════
-- Allow inserting without hiuid during Beta.
-- In prod, we'll re-add NOT NULL + FK after KYC is mandatory.

ALTER TABLE creator_tokens ALTER COLUMN hiuid DROP NOT NULL;

-- ════════════════════════════════════════════════════════
-- 3. WALLET_ADDRESS UNIQUE ON CREATOR_TOKENS
-- ════════════════════════════════════════════════════════
-- One wallet = one token. The API checks this but the DB should too.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'creator_tokens_wallet_address_key'
  ) THEN
    ALTER TABLE creator_tokens ADD CONSTRAINT creator_tokens_wallet_address_key UNIQUE (wallet_address);
    RAISE NOTICE 'Added UNIQUE constraint on creator_tokens.wallet_address';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════
-- 4. FIX RLS POLICIES FOR SERVICE ROLE WRITES
-- ════════════════════════════════════════════════════════
-- The service_role key bypasses RLS by default in Supabase,
-- but if you're using the anon or authenticated key anywhere,
-- these policies ensure proper access.

-- Allow service-level inserts on creator_tokens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Service can insert creator_tokens' 
    AND tablename = 'creator_tokens'
  ) THEN
    CREATE POLICY "Service can insert creator_tokens"
      ON creator_tokens FOR INSERT
      WITH CHECK (true);
    RAISE NOTICE 'Added INSERT policy on creator_tokens';
  END IF;
END $$;

-- Allow service-level updates on creator_tokens (for profile edits)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Service can update creator_tokens' 
    AND tablename = 'creator_tokens'
  ) THEN
    CREATE POLICY "Service can update creator_tokens"
      ON creator_tokens FOR UPDATE
      USING (true);
    RAISE NOTICE 'Added UPDATE policy on creator_tokens';
  END IF;
END $$;

-- Allow service-level inserts on token_holders (for Helius webhook)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Service can insert token_holders' 
    AND tablename = 'token_holders'
  ) THEN
    CREATE POLICY "Service can insert token_holders"
      ON token_holders FOR INSERT
      WITH CHECK (true);
    RAISE NOTICE 'Added INSERT policy on token_holders';
  END IF;
END $$;

-- Allow service-level updates on token_holders (for balance sync)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Service can update token_holders' 
    AND tablename = 'token_holders'
  ) THEN
    CREATE POLICY "Service can update token_holders"
      ON token_holders FOR UPDATE
      USING (true);
    RAISE NOTICE 'Added UPDATE policy on token_holders';
  END IF;
END $$;

-- Allow service-level inserts on profiles (for auth session sync)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Service can insert profiles' 
    AND tablename = 'profiles'
  ) THEN
    CREATE POLICY "Service can insert profiles"
      ON profiles FOR INSERT
      WITH CHECK (true);
    RAISE NOTICE 'Added INSERT policy on profiles';
  END IF;
END $$;

-- Allow service-level inserts on creator_activity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Service can manage creator_activity' 
    AND tablename = 'creator_activity'
  ) THEN
    CREATE POLICY "Service can manage creator_activity"
      ON creator_activity FOR ALL
      USING (true);
    RAISE NOTICE 'Added ALL policy on creator_activity';
  END IF;
END $$;

-- Allow service-level inserts on inner_circle_posts (for API)
-- Override the blocking policy from schema.sql
DROP POLICY IF EXISTS "No public insert on inner_circle_posts" ON inner_circle_posts;
CREATE POLICY "Service can manage inner_circle_posts"
  ON inner_circle_posts FOR ALL
  USING (true);

-- Same for reactions and replies
DROP POLICY IF EXISTS "No public insert on reactions" ON inner_circle_reactions;
CREATE POLICY "Service can manage inner_circle_reactions"
  ON inner_circle_reactions FOR ALL
  USING (true);

DROP POLICY IF EXISTS "No public insert on replies" ON inner_circle_replies;
CREATE POLICY "Service can manage inner_circle_replies"
  ON inner_circle_replies FOR ALL
  USING (true);


-- ════════════════════════════════════════════════════════
-- 5. VERIFIED IDENTITIES — Open for service writes
-- ════════════════════════════════════════════════════════
-- Override the blocking policy from schema.sql
DROP POLICY IF EXISTS "No public access to verified_identities" ON verified_identities;

CREATE POLICY "Service can manage verified_identities"
  ON verified_identities FOR ALL
  USING (true);

-- ════════════════════════════════════════════════════════
-- DONE — Beta Migration Applied
-- ════════════════════════════════════════════════════════
-- To revert for production:
--   1. ALTER TABLE creator_tokens ALTER COLUMN hiuid SET NOT NULL;
--   2. ALTER TABLE creator_tokens ADD CONSTRAINT creator_tokens_hiuid_fkey
--      FOREIGN KEY (hiuid) REFERENCES verified_identities(hiuid) ON DELETE RESTRICT;
--   3. Update all temp hiuid values to real KYC hiuids
