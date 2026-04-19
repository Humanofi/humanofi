// ========================================
// Humanofi — Screener Row 
// ========================================
// Ultra-dense terminal row representing a creator.
// Replaces the "Card" for the Screener view.

import Link from "next/link";
import Image from "next/image";
import Flag from "@/components/Flag";
import SparklineChart from "./SparklineChart";
import { Info } from "@phosphor-icons/react";

interface ScreenerRowProps {
  id: string;
  name: string;
  tag: string;
  price: string;
  priceUsd?: string;
  change24h: number;
  change7d: number;
  holders: number;
  photoUrl: string;
  mintAddress?: string;
  activityScore?: number;
  country?: string;
  offer?: string;
}

export default function ScreenerRow({
  id,
  name,
  tag,
  price,
  priceUsd,
  change24h,
  change7d,
  holders,
  photoUrl,
  mintAddress,
  activityScore = 0,
  country,
  offer,
}: ScreenerRowProps) {
  const tickerName = name.split(" ")[0].toUpperCase();
  const hasOffer = offer && offer.length > 10;

  return (
    <Link href={`/person/${id}`} className="screener-row">
      
      {/* 1. Identity & Avatar */}
      <div className="term-cell term-cell--id screener-row__identity">
        <div className="screener-row__avatar-wrap">
          <Image src={photoUrl} alt={name} width={36} height={36} className="screener-row__avatar" />
          {hasOffer && (
            <div className="screener-tooltip">
              <span className="screener-tooltip__title">What I Offer</span>
              <p className="screener-tooltip__text">
                {offer!.length > 180 ? offer!.substring(0, 180) + "..." : offer}
              </p>
              <span className="screener-tooltip__cta">Inspect Profile</span>
            </div>
          )}
        </div>
        <div className="screener-row__identity-info">
          <div className="screener-row__name-line">
            <span className="screener-row__name">{name}</span>
            {hasOffer && <Info size={14} weight="bold" className="screener-row__info-icon" />}
          </div>
          <div className="screener-row__tag-line">
            <span className="screener-row__ticker">${tickerName}</span>
            <span className="screener-row__bullet">•</span>
            <span className="screener-row__tag">{tag}</span>
            {country && (
              <>
                <span className="screener-row__bullet">•</span>
                <Flag code={country} size={11} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Price */}
      <div className="term-cell term-cell--price screener-row__price">
        <div className="screener-row__price-col">
          <span className="screener-row__val">{price}</span>
          {priceUsd && <span className="screener-row__subval">{priceUsd}</span>}
        </div>
      </div>

      {/* 3. 24h & 7d Change */}
      <div className="term-cell term-cell--change screener-row__change">
        <span className={`screener-row__perc ${change24h >= 0 ? "screener-row__perc--up" : "screener-row__perc--down"}`}>
          {change24h >= 0 ? "+" : ""}{change24h.toFixed(1)}%
        </span>
      </div>
      <div className="term-cell term-cell--change screener-row__change hide-mobile">
        <span className={`screener-row__perc ${change7d >= 0 ? "screener-row__perc--up" : "screener-row__perc--down"}`}>
          {change7d >= 0 ? "+" : ""}{change7d.toFixed(1)}%
        </span>
      </div>

      {/* 4. Holders / Vol */}
      <div className="term-cell term-cell--stats screener-row__stats hide-tablet">
        <span className="screener-row__val">{holders.toLocaleString()}</span>
      </div>

      {/* 5. Activity Score */}
      <div className="term-cell term-cell--activity screener-row__activity hide-mobile">
        <div className="screener-row__score-bar">
          <div 
            className="screener-row__score-fill" 
            style={{ 
              width: `${activityScore}%`,
              background: activityScore >= 70 ? "var(--green)" : activityScore >= 40 ? "var(--orange)" : "var(--red)"
            }} 
          />
        </div>
        <span className="screener-row__score-val">{activityScore}</span>
      </div>

      {/* 6. Mini Ticker */}
      <div className="term-cell term-cell--chart screener-row__chart hide-tablet">
        <div style={{ width: "80px", height: "24px" }}>
          <SparklineChart mintAddress={mintAddress} change={change24h} />
        </div>
      </div>

    </Link>
  );
}
