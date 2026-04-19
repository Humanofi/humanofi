"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd } from "@/lib/price";
import { Trophy } from "@phosphor-icons/react";

interface TopCreator {
  mint_address: string;
  display_name: string;
  avatar_url: string | null;
  category: string;
  holder_count: number;
}

function SolPriceTicker() {
  const { priceUsd, loading } = useSolPrice();

  if (loading || priceUsd === 0) {
    return (
      <div className="footer__sol-price footer__sol-price--loading">
        <span className="footer__sol-dot" />
        SOL / USD —
      </div>
    );
  }

  return (
    <div className="footer__sol-price">
      <span className="footer__sol-dot footer__sol-dot--live" />
      SOL / USD <strong>{formatUsd(priceUsd)}</strong>
    </div>
  );
}

function TopFive() {
  const [creators, setCreators] = useState<TopCreator[]>([]);

  useEffect(() => {
    fetch("/api/creators?limit=5&sort=holder_count")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCreators(data.slice(0, 5));
        } else if (data?.creators) {
          setCreators(data.creators.slice(0, 5));
        }
      })
      .catch(() => {});
  }, []);

  if (creators.length === 0) return null;

  return (
    <div className="footer__top5">
      <div className="footer__col-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Trophy size={14} weight="fill" style={{ color: "#f59e0b" }} />
        Top Humans
      </div>
      {creators.map((c, i) => (
        <Link
          key={c.mint_address}
          href={`/person/${c.mint_address}`}
          className="footer__top5-item"
        >
          <span className="footer__top5-rank">{i + 1}</span>
          <Image
            src={c.avatar_url || "/default-avatar.png"}
            alt={c.display_name}
            width={22}
            height={22}
            style={{ objectFit: "cover", border: "1.5px solid var(--border)" }}
          />
          <span className="footer__top5-name">{c.display_name}</span>
          <span className="footer__top5-holders">{c.holder_count || 0} holders</span>
        </Link>
      ))}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        {/* Left — Brand */}
        <div className="footer__brand">
          <Image
            src="/Logo_noire.png"
            alt="Humanofi"
            width={100}
            height={22}
            style={{ width: "auto", height: 22, objectFit: "contain", opacity: 0.7 }}
          />
          <p className="footer__tagline">
            The first market where humans are the asset.
          </p>
        </div>

        {/* Center — Top Humans */}
        <TopFive />

        {/* Right — Links */}
        <div className="footer__cols">
          <div className="footer__col">
            <div className="footer__col-title">Protocol</div>
            <Link href="/" className="footer__link">Home</Link>
            <Link href="/explore" className="footer__link">Explore</Link>
            <Link href="/create" className="footer__link">Create Token</Link>
          </div>

          <div className="footer__col">
            <div className="footer__col-title">Resources</div>
            <a href="https://github.com" className="footer__link" target="_blank" rel="noopener">GitHub</a>
            <a href="#" className="footer__link">Documentation</a>
            <a href="#" className="footer__link">Smart Contract</a>
          </div>

          <div className="footer__col">
            <div className="footer__col-title">Community</div>
            <a href="#" className="footer__link">Twitter / X</a>
            <a href="#" className="footer__link">Discord</a>
            <a href="#" className="footer__link">Telegram</a>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer__bottom">
        <span>© {new Date().getFullYear()} Humanofi Protocol. All rights reserved.</span>
        <div className="footer__bottom-links">
          <SolPriceTicker />
          <a href="#" className="footer__link">Privacy</a>
          <a href="#" className="footer__link">Terms</a>
          <span className="footer__solana">Built on Solana ◈</span>
        </div>
      </div>
    </footer>
  );
}
