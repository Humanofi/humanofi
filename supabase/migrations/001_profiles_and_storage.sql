-- ========================================================
-- HUMANOFI — Migration 001: Storage Buckets + Profiles
-- ========================================================
-- Run AFTER the initial schema.sql
-- Date: 2026-04-10
-- 
-- Changes:
--   1. Create 'profiles' table (if not exists from initial run)
--   2. Create Storage buckets: avatars, metadata
--   3. Storage RLS policies for public read + service upload
-- ========================================================


-- ════════════════════════════════════════════════════════
-- 1. PROFILES TABLE (skip if already exists)
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address  TEXT NOT NULL UNIQUE,
  privy_user_id   TEXT,
  display_name    TEXT,
  avatar_url      TEXT,
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_privy ON profiles(privy_user_id) WHERE privy_user_id IS NOT NULL;

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Anyone can read profiles'
  ) THEN
    CREATE POLICY "Anyone can read profiles"
      ON profiles FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      USING (auth.jwt() ->> 'wallet_address' = wallet_address);
  END IF;
END $$;

-- Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_profiles ON profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ════════════════════════════════════════════════════════
-- 2. STORAGE BUCKETS
-- ════════════════════════════════════════════════════════
-- avatars: profile photos (also used as token image)
-- metadata: Metaplex-standard JSON files

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('metadata', 'metadata', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (idempotent with DO blocks)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read avatars'
  ) THEN
    CREATE POLICY "Public read avatars"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service upload avatars'
  ) THEN
    CREATE POLICY "Service upload avatars"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'avatars');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read metadata'
  ) THEN
    CREATE POLICY "Public read metadata"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'metadata');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service upload metadata'
  ) THEN
    CREATE POLICY "Service upload metadata"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'metadata');
  END IF;
END $$;


-- ════════════════════════════════════════════════════════
-- DONE — Migration 001
-- ════════════════════════════════════════════════════════
-- New: profiles table, avatars bucket, metadata bucket
-- All statements are idempotent (safe to re-run)
