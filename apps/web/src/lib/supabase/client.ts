// ========================================
// Humanofi — Supabase Client
// ========================================

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/**
 * Supabase client for browser/client-side usage.
 * Uses the anon key — all queries go through RLS.
 * Returns null if env vars are not set (development without Supabase).
 */
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Create a server-side Supabase client with service role key.
 * Only use in API routes — never expose to the client.
 */
export function createServerClient(): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      "[Humanofi] Missing Supabase env vars — running without database"
    );
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey);
}
