// ========================================
// Humanofi — Data Layer
// ========================================
// Abstracts data access. Uses Supabase in production,
// falls back to mockData.ts in development without env vars.

import { supabase } from "@/lib/supabase/client";
import { PEOPLE, getPersonById as getMockPersonById, type Person } from "@/lib/mockData";

// ─── Types ───

export interface CreatorToken {
  id: string;
  mint_address: string;
  wallet_address: string;
  display_name: string;
  category: string;
  bio: string;
  avatar_url: string;
  activity_score: number;
  activity_status: string;
  created_at: string;
  // Extended fields (may come from client-side enrichment)
  story?: string;
  offer?: string;
  apy?: number;
  country?: string;
  socials?: Record<string, string>;
}

export interface TokenHolder {
  wallet_address: string;
  mint_address: string;
  balance: number;
  first_bought_at: string;
}

// ─── Data Fetching ───

/**
 * Get all persons / creator tokens for the explore page.
 * Falls back to mock data if Supabase is not configured.
 */
export async function getAllPersons(): Promise<Person[]> {
  if (!supabase) {
    return PEOPLE;
  }

  try {
    const { data, error } = await supabase
      .from("creator_tokens")
      .select("*")
      .order("activity_score", { ascending: false });

    if (error || !data || data.length === 0) {
      console.warn("[Humanofi] Supabase returned no data, using mock data");
      return PEOPLE;
    }

    // Transform Supabase rows to Person interface
    return data.map(mapCreatorToPerson);
  } catch {
    return PEOPLE;
  }
}

/**
 * Get a single person by their slug ID.
 */
export async function getPersonById(id: string): Promise<Person | undefined> {
  if (!supabase) {
    return getMockPersonById(id);
  }

  try {
    // Try by mint_address first, then by slug-like id
    const { data, error } = await supabase
      .from("creator_tokens")
      .select("*")
      .or(`mint_address.eq.${id},id.eq.${id}`)
      .single();

    if (error || !data) {
      return getMockPersonById(id);
    }

    return mapCreatorToPerson(data);
  } catch {
    return getMockPersonById(id);
  }
}

/**
 * Get holder count for a specific token.
 */
export async function getHolderCount(mintAddress: string): Promise<number> {
  if (!supabase) return 0;

  const { count } = await supabase
    .from("token_holders")
    .select("*", { count: "exact", head: true })
    .eq("mint_address", mintAddress)
    .gt("balance", 0);

  return count || 0;
}

/**
 * Check if a wallet holds tokens of a specific mint.
 */
export async function isHolder(
  walletAddress: string,
  mintAddress: string
): Promise<boolean> {
  if (!supabase) return false;

  const { data } = await supabase
    .from("token_holders")
    .select("balance")
    .eq("wallet_address", walletAddress)
    .eq("mint_address", mintAddress)
    .gt("balance", 0)
    .single();

  return !!data;
}

/**
 * Get inner circle posts for a token (only if holder).
 */
export async function getInnerCirclePosts(mintAddress: string) {
  if (!supabase) return [];

  const { data } = await supabase
    .from("inner_circle_posts")
    .select("*")
    .eq("creator_mint", mintAddress)
    .order("created_at", { ascending: false })
    .limit(20);

  return data || [];
}

/**
 * Create an inner circle post (creator only).
 */
export async function createInnerCirclePost(
  mintAddress: string,
  content: string,
  imageUrls: string[] = []
) {
  if (!supabase) throw new Error("Database not configured");

  const { data, error } = await supabase.from("inner_circle_posts").insert({
    creator_mint: mintAddress,
    content,
    image_urls: imageUrls,
  });

  if (error) throw error;
  return data;
}

// ─── Helpers ───

function mapCreatorToPerson(row: Record<string, unknown>): Person {
  const name = (row.display_name as string) || "Unknown";
  // Use mint_address as ID so /person/[id] can find real creators
  const id = (row.mint_address as string) || name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return {
    id,
    name,
    tag: capitalize((row.category as string) || "other"),
    price: "$0.00", // Will be read from on-chain bonding curve
    priceNum: 0,
    change: 0,
    holders: 0, // Will be enriched by holder count query
    marketCap: "$0",
    photoUrl: (row.avatar_url as string) || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=face",
    sparkline: Array.from({ length: 12 }, () => Math.floor(Math.random() * 18) + 3),
    bio: (row.bio as string) || "",
    story: (row.story as string) || "",
    offer: (row.offer as string) || "",
    apy: (row.apy as number) || 0,
    country: (row.country_code as string) || (row.country as string) || "",
    socials: (row.socials as Record<string, string>) || {},
    activityScore: (row.activity_score as number) || 0,
    vestingYear: (row.vesting_year as number) || 1,
    totalUnlocked: (row.total_unlocked as number) || 0,
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
