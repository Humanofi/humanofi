-- ========================================
-- Humanofi — Creator Profile Extended Fields
-- ========================================
-- Adds: subtitle, youtube_url, gallery_urls, token_color
-- Used by: Profile page, Manage page, PersonCard

-- ── New columns ──

ALTER TABLE creator_tokens
  ADD COLUMN IF NOT EXISTS subtitle TEXT DEFAULT '' NOT NULL;

ALTER TABLE creator_tokens
  ADD COLUMN IF NOT EXISTS youtube_url TEXT DEFAULT '';

ALTER TABLE creator_tokens
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}';

ALTER TABLE creator_tokens
  ADD COLUMN IF NOT EXISTS token_color TEXT DEFAULT 'blue' NOT NULL;

-- Validate token_color is in the palette
ALTER TABLE creator_tokens
  DROP CONSTRAINT IF EXISTS creator_tokens_token_color_check;

ALTER TABLE creator_tokens
  ADD CONSTRAINT creator_tokens_token_color_check
  CHECK (token_color IN ('blue', 'violet', 'emerald', 'orange', 'crimson', 'cyan', 'amber', 'pink'));

-- ── Gallery storage bucket ──

INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read gallery'
  ) THEN
    CREATE POLICY "Public read gallery"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'gallery');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service upload gallery'
  ) THEN
    CREATE POLICY "Service upload gallery"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'gallery');
  END IF;
END $$;
