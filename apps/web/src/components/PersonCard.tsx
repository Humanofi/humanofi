import Link from "next/link";
import Image from "next/image";
import SparklineChart from "./SparklineChart";
import Flag from "@/components/Flag";

interface PersonCardProps {
  id: string;
  name: string;
  tag: string;
  price: string;
  change: number;
  holders: number;
  photoUrl: string;
  sparkline: number[];
  bio: string;
  mintAddress?: string;
  activityScore?: number;
  country?: string;
  offer?: string;
  change24h?: number;
  solReserve?: number;
}

export default function PersonCard({
  id,
  name,
  tag,
  price,
  change,
  holders,
  photoUrl,
  sparkline,
  bio,
  mintAddress,
  activityScore = 0,
  country,
  offer,
  change24h,
  solReserve,
}: PersonCardProps) {
  const tickerName = name.split(" ")[0].toUpperCase();
  const displayChange = change24h !== undefined ? change24h : change;
  const hasOffer = offer && offer.length > 10;

  return (
    <Link href={`/person/${id}`} className="card">
      <div className="card__top">
        <div className="card__top-left">
          <span className="card__tag">{tag}</span>
          {country && <Flag code={country} size={13} />}
        </div>
        <span
          className={`card__change ${
            displayChange >= 0 ? "card__change--up" : "card__change--down"
          }`}
        >
          {displayChange >= 0 ? "+" : ""}
          {displayChange}%
          {change24h !== undefined && (
            <span className="card__change-label">24h</span>
          )}
        </span>
      </div>

      <div className="card__photo-wrapper">
        <Image src={photoUrl} alt={name} width={400} height={400} className="card__photo" />
        {/* Hover overlay — shows offer or fallback */}
        <div className="card__overlay">
          {hasOffer ? (
            <>
              <div className="card__overlay-offer">
                <span className="card__overlay-offer-title">What I Offer</span>
                <p className="card__overlay-offer-text">
                  {offer!.length > 140 ? offer!.substring(0, 140) + "..." : offer}
                </p>
              </div>
              <span className="card__overlay-cta">View Profile ↗</span>
            </>
          ) : (
            <span className="card__overlay-cta">View Profile ↗</span>
          )}
        </div>
      </div>

      <div className="card__name">{name}</div>
      <div className="card__bio">
        &quot;{bio.length > 70 ? bio.substring(0, 70) + '...' : bio}&quot;
      </div>

      <div className="card__market-data">
        <div className="card__price-row">
          <div className="card__price-group">
            <span className="card__price">{price}</span>
            <span className="card__ticker"> {tickerName}</span>
          </div>
          <SparklineChart
            mintAddress={mintAddress}
            change={change}
          />
        </div>
        <div className="card__stats-row">
          <span className="card__holders">{holders.toLocaleString("en-US")} holders</span>
          {solReserve !== undefined && solReserve > 0 && (
            <span className="card__sol-reserve">{solReserve >= 0.01 ? solReserve.toFixed(2) : solReserve.toFixed(4)} SOL</span>
          )}
          {activityScore > 0 && (
            <span className="card__score">
              <span className="card__score-dot" style={{
                background: activityScore >= 70 ? "#22c55e" : activityScore >= 40 ? "#f59e0b" : "#ef4444"
              }} />
              {activityScore}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
