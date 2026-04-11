-- ========================================================
-- HUMANOFI — Migration 014: Post View Counter
-- ========================================================
-- Lightweight view tracking: denormalized counter on posts.
-- Incremented via API when a holder loads the inner circle feed.
-- 
-- Why a counter and not a view_events table?
-- - A view_events table with 1 row per view = write-heavy, bloats DB fast
-- - A simple counter (UPDATE SET view_count = view_count + 1) is 1 atomic op
-- - We deduplicate per wallet/session via API logic (not DB constraints)
-- - Good enough for a dashboard metric, not analytics-grade
-- ========================================================

-- Add view_count to inner circle posts
ALTER TABLE inner_circle_posts
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0 NOT NULL;

-- Add view_count to public posts (same pattern)
ALTER TABLE public_posts
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0 NOT NULL;

-- RPC function: increment view_count for a batch of post IDs in 1 query
-- Called fire-and-forget when a holder loads the feed.
-- Not deduplicated per session — acceptable for a dashboard metric.
CREATE OR REPLACE FUNCTION increment_view_counts(post_ids UUID[])
RETURNS VOID AS $$
BEGIN
  UPDATE inner_circle_posts
  SET view_count = view_count + 1
  WHERE id = ANY(post_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
