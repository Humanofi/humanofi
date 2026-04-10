-- ========================================
-- Humanofi — Migration 007: Inner Circle Questions (AMA)
-- ========================================
-- Private Q&A system:
--   - Creator publishes a "question" type post (AMA session)
--   - Holders submit questions (private: only visible to sender + creator)
--   - Creator can answer each question (text response)
--   - Other holders CANNOT see each other's questions

CREATE TABLE IF NOT EXISTS inner_circle_questions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         UUID NOT NULL REFERENCES inner_circle_posts(id) ON DELETE CASCADE,
  wallet_address  TEXT NOT NULL,          -- Who asked the question
  question        TEXT NOT NULL CHECK (char_length(question) <= 500),
  answer          TEXT DEFAULT NULL,      -- Creator's response (null = unanswered)
  answered_at     TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_questions_post ON inner_circle_questions(post_id);
CREATE INDEX IF NOT EXISTS idx_questions_wallet ON inner_circle_questions(wallet_address, post_id);

-- RLS
ALTER TABLE inner_circle_questions ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (beta)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'inner_circle_questions' AND policyname = 'service_manage_questions'
  ) THEN
    CREATE POLICY "service_manage_questions" ON inner_circle_questions
      FOR ALL USING (true) WITH CHECK (true);
    RAISE NOTICE 'Added ALL policy on inner_circle_questions';
  END IF;
END $$;
