import Link from "next/link";
import Image from "next/image";

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
}: PersonCardProps) {
  // Generate a very simple SVG sparkline path
  const max = Math.max(...sparkline, 1);
  const min = Math.min(...sparkline, 0);
  const range = max - min;
  const width = 100;
  const height = 30;
  const step = width / (sparkline.length - 1 || 1);
  
  const d = sparkline.reduce((acc, val, i) => {
    const x = i * step;
    const y = height - ((val - min) / range) * height;
    return `${acc} ${i === 0 ? 'M' : 'L'} ${x},${y}`;
  }, "");

  const tickerName = name.split(" ")[0].toUpperCase();

  return (
    <Link href={`/person/${id}`} className="card">
      <div className="card__top">
        <span className="card__tag">{tag}</span>
        <span
          className={`card__change ${
            change >= 0 ? "card__change--up" : "card__change--down"
          }`}
        >
          {change >= 0 ? "+" : ""}
          {change}%
        </span>
      </div>

      <div className="card__photo-wrapper">
        <Image src={photoUrl} alt={name} width={400} height={400} className="card__photo" />
      </div>

      <div className="card__name">{name}</div>
      <div className="card__bio">
        &quot;{bio.length > 80 ? bio.substring(0, 80) + '...' : bio}&quot;
      </div>

      <div className="card__market-data">
        <div className="card__price-row">
          <div className="card__price-group">
            <span className="card__price">{price}</span>
            <span className="card__ticker"> ${tickerName}</span>
          </div>
          <svg width={width} height={height} className="card__sparkline" viewBox={`0 -5 ${width} ${height + 10}`}>
            <path
              d={d}
              fill="none"
              stroke={change >= 0 ? "var(--up)" : "var(--down)"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="card__holders">{holders.toLocaleString("en-US")} holders</div>
      </div>
      
      <div className="card__hover-btn">
        Invest in {name.split(" ")[0]} ↗
      </div>
    </Link>
  );
}
