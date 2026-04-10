"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import PersonCard from "@/components/PersonCard";
import Footer from "@/components/Footer";
import { getAllPersons } from "@/lib/data";
import { CATEGORIES } from "@/lib/mockData";
import type { Person } from "@/lib/mockData";
import Image from "next/image";
import TrendingNow from "@/components/public-feed/TrendingNow";

const CATEGORY_MAP: Record<string, string[]> = {
  All: [],
  Traders: ["Trader"],
  Founders: ["Founder"],
  Artists: ["Artist", "Musician", "Designer"],
  Thinkers: ["Thinker", "Activist"],
  Researchers: ["AI Researcher", "Researcher", "Inventor"],
};

const COUNTRIES = ["All", "US", "FR", "UK", "CH", "DE", "BR", "AE", "JP", "SE", "PT", "MA", "LB"];

export default function ExplorePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeCountry, setActiveCountry] = useState("All");
  const [sortBy, setSortBy] = useState("Holders");
  
  const [heroMockUpTick, setHeroMockUpTick] = useState(0);
  
  // Load data from Supabase or mock
  useEffect(() => {
    getAllPersons().then((data) => {
      setPeople(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const int = setInterval(() => {
      setHeroMockUpTick(prev => (prev + 1) % 4);
    }, 2500);
    return () => clearInterval(int);
  }, []);

  const filtered = people.filter((p) => {
    const matchCat = activeCategory === "All" || CATEGORY_MAP[activeCategory]?.includes(p.tag);
    const matchCountry = activeCountry === "All" || p.country === activeCountry;
    return matchCat && matchCountry;
  }).sort((a, b) => {
    if (sortBy === "Holders") return b.holders - a.holders;
    if (sortBy === "Price (High)") return b.priceNum - a.priceNum;
    if (sortBy === "APY (High)") return b.apy - a.apy;
    if (sortBy === "Top Score") return b.activityScore - a.activityScore;
    return 0;
  });

  const heroPerson = people[0];

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />

      <section className="hero">
        <div className="hero__inner">
          <div className="hero__text">
            <div className="hero__tag">
              Live Protocol on Solana
            </div>
            
            <h1 className="hero__title">
              The first market where <span>humans</span> are the asset.
            </h1>
            
            <p className="hero__desc">
              Back the people you believe in. Access their private worlds.
              The value of your access grows with their reputation.
            </p>
            
            <div className="hero__actions">
              <button className="btn-solid" onClick={() => document.getElementById('marketplace')?.scrollIntoView({ behavior: 'smooth' })}>Explore Marketplace</button>
              <button className="btn-outline">How it works</button>
            </div>
          </div>

          <div className="hero__visual">
            {heroPerson && (
              <div className="hero-card-anim">
                <div className="hero-card-inner">
                  <Image 
                    src={heroPerson.photoUrl} 
                    alt={heroPerson.name} 
                    width={340} 
                    height={340} 
                    className="hero-card-anim__photo"
                    priority
                  />
                  
                  <div className="hero-card-anim__badges">
                    <div className={`hc-badge ${heroMockUpTick === 0 ? 'hc-badge--active' : ''}`}>
                      <span className="hc-badge__dot"></span> Verified Identity
                    </div>
                    <div className={`hc-badge ${heroMockUpTick === 1 ? 'hc-badge--active' : ''}`}>
                      Inner Circle: Unlocked ◈
                    </div>
                    <div className={`hc-badge hc-badge--price ${heroMockUpTick === 2 ? 'hc-badge--active-price' : ''}`}>
                      Demand: +12.4% {heroMockUpTick === 2 && <span className="anim-ping"></span>}
                    </div>
                  </div>

                  <div className="hero-card-anim__bottom">
                    <div className="hc-name">{heroPerson.name}</div>
                    <div className="hc-tag">{heroPerson.tag}</div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Trending Now */}
      <TrendingNow />

      <main className="page" id="marketplace">
        <div className="page__header" style={{ marginBottom: 24 }}>
          <h2 className="page__title">Explore the Marketplace</h2>
          <div style={{ fontWeight: 800, color: "var(--text-faint)" }}>
            {loading ? "Loading..." : `${filtered.length} PEOPLE`}
          </div>
        </div>

        <div className="filters" style={{ borderBottom: "none", marginBottom: 40, display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          
          {/* Category Filter */}
          <div className="filter-group">
            <label className="filter-label">Category</label>
            <select 
              className="filter-select" 
              value={activeCategory} 
              onChange={(e) => setActiveCategory(e.target.value)}
            >
              {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          {/* Country Filter */}
          <div className="filter-group">
            <label className="filter-label">Country</label>
            <select 
              className="filter-select" 
              value={activeCountry} 
              onChange={(e) => setActiveCountry(e.target.value)}
            >
              {COUNTRIES.map(c => <option key={c} value={c}>{c === "All" ? "All Countries" : c}</option>)}
            </select>
          </div>

          {/* Sort By */}
          <div className="filter-group">
            <label className="filter-label">Sort By</label>
            <select 
              className="filter-select" 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="Holders">Most Holders</option>
              <option value="Top Score">Top Activity Score</option>
              <option value="APY (High)">Highest APY</option>
              <option value="Price (High)">Highest Price</option>
            </select>
          </div>
          
        </div>

        <div className="grid">
          {filtered.map((person) => (
            <PersonCard
              key={person.id}
              id={person.id}
              name={person.name}
              tag={person.tag}
              price={person.price}
              change={person.change}
              holders={person.holders}
              photoUrl={person.photoUrl}
              sparkline={person.sparkline}
              bio={person.bio}
            />
          ))}
        </div>
      </main>

      <Footer />
    </>
  );
}
