// ========================================
// Humanofi — Screener Sidebar (Dense Terminal UI)
// ========================================

"use client";

import { useState } from "react";
import Flag from "@/components/Flag";
import { MagnifyingGlass, FunnelSimple, ArrowsClockwise } from "@phosphor-icons/react";

export interface ScreenerFilters {
  search: string;
  categories: string[];
  priceMin: number;
  priceMax: number;
  holdersMin: number;
  holdersMax: number;
  scoreMin: number;
  scoreMax: number;
  trend: string;
  age: string;
  status: string;
  countries: string[];
}

export const DEFAULT_FILTERS: ScreenerFilters = {
  search: "",
  categories: [],
  priceMin: 0,
  priceMax: 999,
  holdersMin: 0,
  holdersMax: 100000,
  scoreMin: 0,
  scoreMax: 100,
  trend: "all",
  age: "all",
  status: "all",
  countries: [],
};

interface ScreenerSidebarProps {
  filters: ScreenerFilters;
  onChange: (filters: ScreenerFilters) => void;
  resultCount: number;
}

const CATEGORIES = [
  "Founder", "Creator", "Developer", "Trader", "Artist", "Musician",
  "Athlete", "Influencer", "Researcher", "Thinker", "Investor", "Designer",
  "Writer", "Filmmaker", "Photographer", "Educator"
];

const COUNTRIES = [
  "US", "GB", "FR", "DE", "ES", "IT", "PT", "NL", "BE", "CH", "AT",
  "SE", "NO", "DK", "FI", "PL", "CZ", "IE", "CA", "AU"
];

function countActive(f: ScreenerFilters): number {
  let n = 0;
  if (f.search) n++;
  if (f.categories.length > 0) n++;
  if (f.priceMin > 0 || f.priceMax < 999) n++;
  if (f.holdersMin > 0 || f.holdersMax < 100000) n++;
  if (f.scoreMin > 0 || f.scoreMax < 100) n++;
  if (f.trend !== "all") n++;
  if (f.age !== "all") n++;
  if (f.status !== "all") n++;
  if (f.countries.length > 0) n++;
  return n;
}

export default function ScreenerSidebar({ filters, onChange, resultCount }: ScreenerSidebarProps) {
  const [catExpanded, setCatExpanded] = useState(false);
  const activeCount = countActive(filters);

  const update = (patch: Partial<ScreenerFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const toggleCategory = (cat: string) => {
    const cats = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    update({ categories: cats });
  };

  const toggleCountry = (code: string) => {
    const arr = filters.countries.includes(code)
      ? filters.countries.filter((c) => c !== code)
      : [...filters.countries, code];
    update({ countries: arr });
  };

  const visibleCats = catExpanded ? CATEGORIES : CATEGORIES.slice(0, 8);

  return (
    <aside className="term-sidebar">
      <div className="term-sidebar__header">
        <div className="term-sidebar__title">
          <FunnelSimple size={14} weight="bold" />
          <span>Screener</span>
          {activeCount > 0 && <span className="term-sidebar__badge">{activeCount}</span>}
        </div>
        {activeCount > 0 && (
          <button className="term-sidebar__reset" onClick={() => onChange(DEFAULT_FILTERS)}>
            CLEAR
          </button>
        )}
      </div>

      <div className="term-sidebar__scroll">
        
        {/* Search */}
        <div className="term-section">
          <div className="term-search">
            <MagnifyingGlass size={14} weight="bold" className="term-search__icon" />
            <input
              type="text"
              placeholder="QUICK SEARCH..."
              className="term-search__input"
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
          </div>
        </div>

        {/* Categories */}
        <div className="term-section">
          <div className="term-section__title">CATEGORIES</div>
          <div className="term-chips">
            {visibleCats.map((cat) => (
              <button
                key={cat}
                className={`term-chip ${filters.categories.includes(cat) ? "is-active" : ""}`}
                onClick={() => toggleCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          {CATEGORIES.length > 8 && (
            <button className="term-more" onClick={() => setCatExpanded(!catExpanded)}>
              {catExpanded ? "- LESS" : "+ MORE"}
            </button>
          )}
        </div>

        {/* Price & Holders (Inline Range) */}
        <div className="term-section term-section--split">
          <div className="term-split">
            <div className="term-section__title">PRICE (SOL)</div>
            <div className="term-inline-range">
              <input 
                type="number" className="term-inline-input" placeholder="MIN" 
                value={filters.priceMin || ""} onChange={(e) => update({ priceMin: Number(e.target.value) || 0 })}
              />
              <span className="term-sep">-</span>
              <input 
                type="number" className="term-inline-input" placeholder="MAX" 
                value={filters.priceMax >= 999 ? "" : filters.priceMax} onChange={(e) => update({ priceMax: Number(e.target.value) || 999 })}
              />
            </div>
          </div>
          
          <div className="term-split">
            <div className="term-section__title">HOLDERS</div>
            <div className="term-inline-range">
              <input 
                type="number" className="term-inline-input" placeholder="MIN" 
                value={filters.holdersMin || ""} onChange={(e) => update({ holdersMin: Number(e.target.value) || 0 })}
              />
              <span className="term-sep">-</span>
              <input 
                type="number" className="term-inline-input" placeholder="MAX" 
                value={filters.holdersMax >= 100000 ? "" : filters.holdersMax} onChange={(e) => update({ holdersMax: Number(e.target.value) || 100000 })}
              />
            </div>
          </div>
        </div>

        {/* Activity Score */}
        <div className="term-section">
          <div className="term-section__title">ACTIVITY SCORE (0-100)</div>
          <div className="term-inline-range">
            <input 
              type="number" className="term-inline-input" placeholder="0" 
              value={filters.scoreMin || ""} onChange={(e) => update({ scoreMin: Number(e.target.value) || 0 })}
            />
            <span className="term-sep">-</span>
            <input 
              type="number" className="term-inline-input" placeholder="100" 
              value={filters.scoreMax >= 100 ? "" : filters.scoreMax} onChange={(e) => update({ scoreMax: Number(e.target.value) || 100 })}
            />
          </div>
        </div>

        {/* Trend (Segmented Controls) */}
        <div className="term-section">
          <div className="term-section__title">PRICE TREND</div>
          <div className="term-segments">
            {[
              { v: "all", l: "ALL" },
              { v: "up24h", l: "UP 24H" },
              { v: "down24h", l: "DWN 24H" },
            ].map((o) => (
              <button key={o.v} className={`term-seg ${filters.trend === o.v ? "is-active" : ""}`} onClick={() => update({ trend: o.v })}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {/* Age */}
        <div className="term-section">
          <div className="term-section__title">TOKEN AGE</div>
          <div className="term-segments">
            {[
              { v: "all", l: "ALL" },
              { v: "7d", l: "< 7D" },
              { v: "30d", l: "< 30D" },
            ].map((o) => (
              <button key={o.v} className={`term-seg ${filters.age === o.v ? "is-active" : ""}`} onClick={() => update({ age: o.v })}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
        
        {/* Country */}
        <div className="term-section">
          <div className="term-section__title">COUNTRY</div>
          <div className="term-chips">
            {COUNTRIES.map((code) => (
              <button
                key={code}
                className={`term-chip term-chip--flag ${filters.countries.includes(code) ? "is-active" : ""}`}
                onClick={() => toggleCountry(code)}
              >
                <Flag code={code} size={11} />
                {code}
              </button>
            ))}
          </div>
        </div>

      </div>
      
      {/* Footer / Results Label */}
      <div className="term-sidebar__footer">
        {resultCount} ASSETS MATCHED
      </div>
    </aside>
  );
}
