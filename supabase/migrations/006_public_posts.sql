-- ========================================================
-- HUMANOFI — Migration 006: Public Posts + Ranking
-- ========================================================
-- Public posts: creators can publish 1 public message/day
-- visible by everyone. Ranked by HotScore algorithm.
-- ========================================================

-- ════════════════════════════════════════════════════════
-- 1. PUBLIC POSTS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public_posts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_mint    TEXT NOT NULL REFERENCES creator_tokens(mint_address) ON DELETE CASCADE,
  content         TEXT NOT NULL CHECK (char_length(content) <= 500),
  media_urls      TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Denormalized algo fields for fast ranking
  reaction_count  INT DEFAULT 0,
  hot_score       FLOAT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_public_posts_hot ON public_posts(hot_score DESC);
CREATE INDEX IF NOT EXISTS idx_public_posts_creator ON public_posts(creator_mint);
CREATE INDEX IF NOT EXISTS idx_public_posts_date ON public_posts(created_at DESC);

-- ════════════════════════════════════════════════════════
-- 2. PUBLIC POST REACTIONS
-- ════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public_post_reactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID NOT NULL REFERENCES public_posts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,
  emoji           TEXT NOT NULL CHECK (emoji IN ('🔥','💡','🙏','🚀','❤️','👀')),
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(post_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_public_reactions_post ON public_post_reactions(post_id);

-- ════════════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════
ALTER TABLE public_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_post_reactions ENABLE ROW LEVEL SECURITY;

-- Public posts: readable by everyone
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'public_posts' AND policyname = 'public_read_posts'
  ) THEN
    CREATE POLICY "public_read_posts" ON public_posts FOR SELECT USING (true);
  END IF;
END $$;

-- Public posts: service role can do everything
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'public_posts' AND policyname = 'service_manage_public_posts'
  ) THEN
    CREATE POLICY "service_manage_public_posts" ON public_posts FOR ALL USING (true);
  END IF;
END $$;

-- Public reactions: readable by everyone
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'public_post_reactions' AND policyname = 'public_read_reactions'
  ) THEN
    CREATE POLICY "public_read_reactions" ON public_post_reactions FOR SELECT USING (true);
  END IF;
END $$;

-- Public reactions: service role can do everything
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'public_post_reactions' AND policyname = 'service_manage_public_reactions'
  ) THEN
    CREATE POLICY "service_manage_public_reactions" ON public_post_reactions FOR ALL USING (true);
  END IF;
END $$;
