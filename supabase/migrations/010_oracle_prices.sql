-- ========================================
-- Humanofi — Oracle Price Table
-- ========================================
-- Stores SOL/USD price from Pyth Hermes.
-- Updated every 10 seconds by a cron job.
-- Frontend reads this instead of calling external APIs.

-- ── Table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oracle_prices (
  id          TEXT PRIMARY KEY DEFAULT 'SOL_USD',
  price_usd   DOUBLE PRECISION NOT NULL,
  confidence  DOUBLE PRECISION NOT NULL DEFAULT 0,
  expo        INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'pyth_hermes',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert initial row
INSERT INTO public.oracle_prices (id, price_usd, confidence, source)
VALUES ('SOL_USD', 0, 0, 'pyth_hermes')
ON CONFLICT (id) DO NOTHING;

-- ── RLS ──────────────────────────────────────
ALTER TABLE public.oracle_prices ENABLE ROW LEVEL SECURITY;

-- Anyone can read the price (public data)
CREATE POLICY "Anyone can read oracle prices"
  ON public.oracle_prices FOR SELECT
  USING (true);

-- Only service_role can update (from edge function / cron)
CREATE POLICY "Service role can update oracle prices"
  ON public.oracle_prices FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ── Realtime ─────────────────────────────────
-- Enable realtime so frontend gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.oracle_prices;

-- ── Grant ────────────────────────────────────
GRANT SELECT ON public.oracle_prices TO anon, authenticated;
GRANT UPDATE, INSERT ON public.oracle_prices TO service_role;

-- ── Cron Job (pg_cron + pg_net) ──────────────
-- Calls our Edge Function every 10 seconds to update SOL price.
-- pg_cron 1.5+ supports second-level intervals.

-- Enable extensions if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the cron job
SELECT cron.schedule(
  'update-sol-price',
  '10 seconds',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/update-sol-price',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── Cleanup cron logs (every hour) ──────────
-- Prevents cron.job_run_details from growing infinitely
SELECT cron.schedule(
  'cleanup-cron-logs',
  '0 * * * *',
  $$
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '1 hour';
  $$
);
