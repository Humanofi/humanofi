-- ========================================================
-- Migration 005: Inner Circle V2 — Rich Posts, Polls, Events, Streaks
-- ========================================================

-- 1. Extend inner_circle_posts with pinning & media
ALTER TABLE inner_circle_posts
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}';

-- 2. Poll votes
CREATE TABLE IF NOT EXISTS poll_votes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  option_index    INT NOT NULL,         -- 0-based index of chosen option
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(post_id, wallet_address)       -- one vote per user per poll
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON poll_votes(post_id);

-- 3. Event RSVPs
CREATE TABLE IF NOT EXISTS event_rsvps (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'interested', 'declined')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(post_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_post ON event_rsvps(post_id);

-- 4. Holder engagement streaks
CREATE TABLE IF NOT EXISTS holder_streaks (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address  TEXT NOT NULL,
  mint_address    TEXT NOT NULL,
  current_streak  INT DEFAULT 0 NOT NULL,
  longest_streak  INT DEFAULT 0 NOT NULL,
  last_active_date DATE,
  badge           TEXT DEFAULT 'none' CHECK (badge IN ('none', 'curious', 'engaged', 'loyalist', 'og', 'legendary')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(wallet_address, mint_address)
);

CREATE INDEX IF NOT EXISTS idx_holder_streaks_wallet ON holder_streaks(wallet_address);
CREATE INDEX IF NOT EXISTS idx_holder_streaks_mint ON holder_streaks(mint_address);

-- 5. RLS Policies
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE holder_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read poll_votes" ON poll_votes FOR SELECT USING (true);
CREATE POLICY "No public insert on poll_votes" ON poll_votes FOR INSERT WITH CHECK (false);

CREATE POLICY "Anyone can read event_rsvps" ON event_rsvps FOR SELECT USING (true);
CREATE POLICY "No public insert on event_rsvps" ON event_rsvps FOR INSERT WITH CHECK (false);

CREATE POLICY "Anyone can read holder_streaks" ON holder_streaks FOR SELECT USING (true);
CREATE POLICY "No public access to holder_streaks" ON holder_streaks FOR UPDATE USING (false);

-- 6. Auto-update triggers
CREATE TRIGGER set_updated_at_holder_streaks
  BEFORE UPDATE ON holder_streaks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Storage bucket for inner circle media
INSERT INTO storage.buckets (id, name, public)
VALUES ('inner-circle-media', 'inner-circle-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read inner-circle-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inner-circle-media');

CREATE POLICY "Service upload inner-circle-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'inner-circle-media');
