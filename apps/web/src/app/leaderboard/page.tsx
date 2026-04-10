"use client";

import { useState, useEffect } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { getAllPersons } from "@/lib/data";
import type { Person } from "@/lib/mockData";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LeaderboardPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    getAllPersons().then((data) => {
      setPeople(data);
      setLoading(false);
    });
  }, []);

  const sorted = [...people].sort((a, b) => b.holders - a.holders);

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />
      <main className="page page--no-hero">
        <div className="page__header" style={{ display: "block" }}>
          <h1 className="page__title">Leaderboard</h1>
          <p className="page__subtitle">
            The people the world believes in — ranked by real trust, with real capital.
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, fontWeight: 800, color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Person</th>
                <th>Price</th>
                <th>Holders</th>
                <th>Market Cap</th>
                <th>Trend</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((person, i) => (
                <tr 
                  key={person.id} 
                  onClick={() => router.push(`/person/${person.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="table__rank">{i + 1}</td>
                  <td>
                    <div className="table__person">
                      <Image
                        src={person.photoUrl}
                        alt={person.name}
                        width={48}
                        height={48}
                        className="table__avatar"
                      />
                      <div>
                        <div className="table__name">{person.name}</div>
                        <div className="table__tag">{person.tag}</div>
                      </div>
                    </div>
                  </td>
                  <td className="table__value table__value--accent">
                    {person.price}
                  </td>
                  <td className="table__value">
                    {person.holders.toLocaleString("en-US")}
                  </td>
                  <td className="table__value">{person.marketCap}</td>
                  <td>
                    <span
                      style={{
                        color: person.change >= 0 ? "var(--up)" : "var(--down)",
                        fontWeight: 800,
                        fontSize: "0.85rem",
                      }}
                    >
                      {person.change >= 0 ? "+" : ""}
                      {person.change}%
                    </span>
                  </td>
                  <td>
                    <div className="table__score">
                      <div
                        className="table__score-bar"
                        style={{ width: `${person.activityScore}px` }}
                      />
                      <span className="table__score-text">
                        {person.activityScore}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
      <Footer />
    </>
  );
}
