// ========================================
// Humanofi — Screener Terminal View
// ========================================
// Replaces grid cards with a dense, list-based terminal layout.

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Topbar from "@/components/Topbar";
import ScreenerRow from "@/components/ScreenerRow";
import Footer from "@/components/Footer";
import ScreenerSidebar, { type ScreenerFilters, DEFAULT_FILTERS } from "@/components/ScreenerSidebar";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatSol, formatUsd, solToUsd } from "@/lib/price";
import { Binoculars, ArrowUp, ArrowDown } from "@phosphor-icons/react";

interface ExploreResult {
  mint_address: string;
  display_name: string;
  category: string;
  bio: string;
  avatar_url: string | null;
  activity_score: number;
  activity_status: string;
  holder_count: number;
  apy: number;
  country_code: string;
  offer: string;
  story: string;
  socials: Record<string, string>;
  created_at: string;
  price_sol: number;
  supply_public: number;
  sol_reserve: number;
  change_24h: number;
  change_7d: number;
}

type SortKey = "activity_score" | "holder_count" | "price_sol" | "change_24h" | "change_7d" | "sol_reserve";

export default function ExplorePage() {
  const [results, setResults] = useState<ExploreResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<SortKey>("activity_score");
  const [sortAsc, setSortAsc] = useState(false);
  const { priceUsd: solPriceUsd } = useSolPrice();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.categories.length === 1) params.set("category", filters.categories[0]);
      if (filters.countries.length === 1) params.set("country", filters.countries[0]);
      if (filters.trend !== "all") params.set("trend", filters.trend);
      if (filters.age !== "all") params.set("age", filters.age);
      // API fallback sort
      params.set("sort", "activity_score");
      params.set("limit", "150");

      const res = await fetch(`/api/explore?${params.toString()}`);
      const data = await res.json();
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [filters.categories, filters.countries, filters.trend, filters.age]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Client-side filtering & sorting
  const filtered = useMemo(() => {
    let data = [...results];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      data = data.filter(r => r.display_name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q));
    }
    if (filters.categories.length > 1) {
      const cats = filters.categories.map(c => c.toLowerCase());
      data = data.filter(r => cats.includes(r.category.toLowerCase()));
    }
    if (filters.countries.length > 1) {
      data = data.filter(r => filters.countries.includes(r.country_code));
    }
    if (filters.priceMin > 0) data = data.filter(r => r.price_sol >= filters.priceMin);
    if (filters.priceMax < 999) data = data.filter(r => r.price_sol <= filters.priceMax);
    if (filters.holdersMin > 0) data = data.filter(r => r.holder_count >= filters.holdersMin);
    if (filters.holdersMax < 100000) data = data.filter(r => r.holder_count <= filters.holdersMax);
    if (filters.scoreMin > 0) data = data.filter(r => r.activity_score >= filters.scoreMin);
    if (filters.scoreMax < 100) data = data.filter(r => r.activity_score <= filters.scoreMax);

    data.sort((a, b) => {
      let valA = a[sortBy] as number;
      let valB = b[sortBy] as number;
      // Handle edge cases
      if (valA === undefined) valA = 0;
      if (valB === undefined) valB = 0;
      
      return sortAsc ? valA - valB : valB - valA;
    });

    return data;
  }, [results, filters, sortBy, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else {
      setSortBy(key);
      setSortAsc(false);
    }
  };

  const getSortIcon = (key: SortKey) => {
    if (sortBy !== key) return null;
    return sortAsc ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />;
  };

  const formatPriceSol = (priceSol: number): string => {
    return formatSol(priceSol);
  };

  const formatPriceUsd = (priceSol: number): string => {
    if (priceSol === 0 || solPriceUsd === 0) return "";
    return formatUsd(solToUsd(priceSol, solPriceUsd));
  };

  // Stats
  const avgScore = filtered.length > 0 ? Math.round(filtered.reduce((acc, r) => acc + r.activity_score, 0) / filtered.length) : 0;

  return (
    <>
      <div className="term-bg" />
      <Topbar />

      <main className="term-wrapper">
        <ScreenerSidebar filters={filters} onChange={setFilters} resultCount={filtered.length} />

        <div className="term-main">
          
          {/* Stats Bar */}
          <div className="term-stats">
            <div className="term-stat">
              <span className="term-stat__label">TOTAL HOLDERS</span>
              <span className="term-stat__val">{filtered.reduce((sum, r) => sum + r.holder_count, 0).toLocaleString()}</span>
            </div>
            <div className="term-stat">
              <span className="term-stat__label">AVG ACTV SCORE</span>
              <span className="term-stat__val">{avgScore}</span>
            </div>
            <div className="term-stat">
              <span className="term-stat__label">LISTINGS</span>
              <span className="term-stat__val">{filtered.length}</span>
            </div>
            <div className="term-stat term-stat--right">
              <span className="term-stat__label">STATUS</span>
              <span className="term-stat__val term-stat__val--green">LIVE</span>
            </div>
          </div>

          {/* Table Area */}
          <div className="term-table">
            
            {/* Table Header */}
            <div className="term-th">
              <div className="term-cell term-cell--id">ASSET / HUMAN</div>
              
              <div 
                className="term-cell term-cell--price term-cell--sortable" 
                onClick={() => handleSort("price_sol")}
              >
                PRICE {getSortIcon("price_sol")}
              </div>
              
              <div 
                className="term-cell term-cell--change term-cell--sortable"
                onClick={() => handleSort("change_24h")}
              >
                24H {getSortIcon("change_24h")}
              </div>
              
              <div 
                className="term-cell term-cell--change hide-mobile term-cell--sortable"
                onClick={() => handleSort("change_7d")}
              >
                7D {getSortIcon("change_7d")}
              </div>

              <div 
                className="term-cell term-cell--stats hide-tablet term-cell--sortable"
                onClick={() => handleSort("holder_count")}
              >
                HOLDERS / VOL {getSortIcon("holder_count")}
              </div>

              <div 
                className="term-cell term-cell--activity hide-mobile term-cell--sortable"
                onClick={() => handleSort("activity_score")}
              >
                SCORE {getSortIcon("activity_score")}
              </div>

              <div className="term-cell term-cell--chart hide-tablet">
                CHART (24H)
              </div>
            </div>

            {/* Table Body */}
            <div className="term-tbody">
              {loading ? (
                <div className="term-empty">FETCHING MARKET DATA...</div>
              ) : filtered.length === 0 ? (
                <div className="term-empty">NO ASSETS MATCH CURRENT CRITERIA.</div>
              ) : (
                filtered.map((r) => (
                  <ScreenerRow
                    key={r.mint_address}
                    id={r.mint_address}
                    name={r.display_name}
                    tag={r.category}
                    price={formatPriceSol(r.price_sol)}
                    priceUsd={formatPriceUsd(r.price_sol)}
                    change24h={r.change_24h}
                    change7d={r.change_7d}
                    holders={r.holder_count}
                    photoUrl={r.avatar_url || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=face"}
                    mintAddress={r.mint_address}
                    activityScore={r.activity_score}
                    country={r.country_code}
                    offer={r.offer}
                  />
                ))
              )}
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
