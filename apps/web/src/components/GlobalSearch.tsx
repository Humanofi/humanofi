// ========================================
// Humanofi — Global Search Component
// ========================================
// Instant search with debounce, keyboard navigation, and brutalist dropdown.

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, Spinner, ArrowRight, User } from "@phosphor-icons/react";
import { generateIdenticon } from "@/lib/identicon";

interface SearchResult {
  mint_address: string;
  display_name: string;
  avatar_url: string | null;
  category: string;
  holder_count: number;
  activity_score: number;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced search ──
  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setIsOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => doSearch(value), 250);
  };

  // ── Navigate to result ──
  const goToResult = (mint: string) => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/person/${mint}`);
  };

  // ── Keyboard navigation ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Escape") {
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          goToResult(results[activeIndex].mint_address);
        }
        break;
      case "Escape":
        setIsOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // ── Click outside to close ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Keyboard shortcut ⌘K / Ctrl+K ──
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const getCategoryEmoji = (cat: string) => {
    const emojiMap: Record<string, string> = {
      creator: "🎨", tech: "💻", sport: "⚽", music: "🎵",
      influencer: "📸", artist: "🖌️", business: "💼", other: "✨",
    };
    return emojiMap[cat?.toLowerCase()] || "✨";
  };

  return (
    <div className="global-search" ref={containerRef}>
      <div className={`global-search__input-wrap ${isOpen && results.length > 0 ? "global-search__input-wrap--active" : ""}`}>
        {loading ? (
          <Spinner size={16} weight="bold" className="global-search__icon global-search__icon--spin" />
        ) : (
          <MagnifyingGlass size={16} weight="bold" className="global-search__icon" />
        )}
        <input
          ref={inputRef}
          type="text"
          className="global-search__input"
          placeholder="Search humans..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          aria-label="Search humans"
          autoComplete="off"
        />
        <kbd className="global-search__kbd">⌘K</kbd>
      </div>

      {/* Results dropdown */}
      {isOpen && (
        <div className="global-search__dropdown">
          {results.length === 0 && query.length >= 2 && !loading ? (
            <div className="global-search__empty">
              <User size={20} weight="bold" style={{ opacity: 0.3 }} />
              <span>No humans found for &quot;{query}&quot;</span>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.mint_address}
                className={`global-search__result ${i === activeIndex ? "global-search__result--active" : ""}`}
                onClick={() => goToResult(r.mint_address)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <Image
                  src={r.avatar_url || generateIdenticon(r.mint_address)}
                  alt={r.display_name}
                  width={36}
                  height={36}
                  className="global-search__avatar"
                />
                <div className="global-search__info">
                  <span className="global-search__name">{r.display_name}</span>
                  <span className="global-search__meta">
                    {getCategoryEmoji(r.category)} {r.category} · {r.holder_count || 0} holders
                  </span>
                </div>
                <ArrowRight size={14} weight="bold" className="global-search__arrow" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
