"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChartBar, Shield, Users, Article, ClockClockwise, Coins,
  Warning, Eye, EyeSlash, Prohibit, CheckCircle, Trash,
  UserPlus, Lock, LockOpen, Power, CurrencyDollar, ArrowsDownUp, Package
} from "@phosphor-icons/react";

// ── Types ──

interface DashboardData {
  role: string;
  treasury: { balance: number; wallet: string };
  finance: {
    totalRevenueSol: number;
    trades: {
      totalVolumeSol: number;
      buyVolumeSol: number;
      sellVolumeSol: number;
      totalTrades: number;
      totalBuys: number;
      totalSells: number;
      treasuryFromBuysSol: number;
      treasuryFromSellsSol: number;
      treasuryTotalSol: number;
      creatorFeesSol: number;
      kDeepeningSol: number;
      totalFeesSol: number;
      founderBuyFeesNote: string;
    };
    drops: {
      totalDrops: number;
      activeDrops: number;
      totalPurchases: number;
      totalPaidSol: number;
      protocolFeeSol: number;
      creatorRevenueSol: number;
    };
  };
  metrics: {
    totalCreators: number;
    suspendedCreators: number;
    totalHolders: number;
    totalPosts: number;
    hiddenPosts: number;
    totalVolumeSol: number;
    activeWarnings: number;
  };
  platform: { emergencyFreeze: boolean; freezeReason: string };
  recentActions: AuditEntry[];
}

interface AuditEntry {
  id: string;
  moderator_wallet: string;
  action_type: string;
  target_type: string;
  target_id: string;
  reason: string;
  created_at: string;
}

interface PostEntry {
  id: string;
  creator_mint: string;
  content: string;
  image_urls: string[];
  is_hidden: boolean;
  hidden_by: string | null;
  hidden_reason: string | null;
  created_at: string;
}

interface CreatorEntry {
  mint_address: string;
  display_name: string;
  category: string;
  wallet_address: string;
  is_suspended: boolean;
  suspension_reason: string | null;
  activity_score: number;
  created_at: string;
}

interface ModeratorEntry {
  wallet_address: string;
  role: string;
  label: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

type Tab = "overview" | "finance" | "content" | "creators" | "moderators" | "audit" | "emergency";

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");

  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [creators, setCreators] = useState<CreatorEntry[]>([]);
  const [moderators, setModerators] = useState<ModeratorEntry[]>([]);
  const [actionReason, setActionReason] = useState("");

  const [newModWallet, setNewModWallet] = useState("");
  const [newModPassword, setNewModPassword] = useState("");
  const [newModLabel, setNewModLabel] = useState("");

  // ── Data fetching ──

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard");
      if (res.status === 403 || res.status === 401) {
        router.push("/admin");
        return;
      }
      const json: DashboardData = await res.json();
      setData(json);
    } catch {
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const fetchContent = useCallback(async () => {
    const res = await fetch("/api/admin/moderation?type=all");
    if (!res.ok) return;
    const json = await res.json();
    setPosts(json.posts || []);
    setCreators(json.creators || []);
  }, []);

  const fetchModerators = useCallback(async () => {
    const res = await fetch("/api/admin/moderators");
    if (!res.ok) return;
    const json = await res.json();
    setModerators(json.wallets || []);
  }, []);

  useEffect(() => {
    if (tab === "content") fetchContent();
    if (tab === "creators") fetchContent();
    if (tab === "moderators") fetchModerators();
  }, [tab, fetchContent, fetchModerators]);

  // ── Actions ──

  const executeAction = async (action: string, targetId: string, reason: string, metadata?: Record<string, unknown>) => {
    if (!reason.trim()) { alert("Reason is required"); return; }
    const res = await fetch("/api/admin/moderation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, targetId, reason, metadata }),
    });
    if (res.ok) {
      fetchDashboard();
      fetchContent();
      setActionReason("");
    } else {
      alert("Action failed");
    }
  };

  const addModerator = async () => {
    if (!newModWallet || !newModPassword) { alert("Wallet and password required"); return; }
    const res = await fetch("/api/admin/moderators", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: newModWallet, password: newModPassword, label: newModLabel }),
    });
    if (res.ok) {
      setNewModWallet(""); setNewModPassword(""); setNewModLabel("");
      fetchModerators();
    } else {
      const err = await res.json();
      alert(err.error || "Failed");
    }
  };

  const revokeModerator = async (wallet: string) => {
    if (!confirm(`Revoke ${wallet}?`)) return;
    await fetch(`/api/admin/moderators?wallet=${wallet}`, { method: "DELETE" });
    fetchModerators();
  };

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    router.push("/admin");
  };

  // ── Loading / Error states ──

  if (loading) {
    return (
      <div className="admin-panel">
        <div style={{ padding: 80, textAlign: "center", color: "var(--text-muted)" }}>Loading admin panel...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-panel">
        <div style={{ padding: 80, textAlign: "center", color: "#ef4444" }}>{error || "Access denied"}</div>
      </div>
    );
  }

  const isAuth = data.role === "authority";

  const tabs: { id: Tab; label: string; icon: React.ReactNode; authOnly?: boolean }[] = [
    { id: "overview", label: "Overview", icon: <ChartBar size={16} weight="bold" /> },
    { id: "finance", label: "Finance", icon: <Coins size={16} weight="bold" />, authOnly: true },
    { id: "content", label: "Content", icon: <Article size={16} weight="bold" /> },
    { id: "creators", label: "Creators", icon: <Users size={16} weight="bold" /> },
    { id: "moderators", label: "Moderators", icon: <Shield size={16} weight="bold" />, authOnly: true },
    { id: "audit", label: "Audit Log", icon: <ClockClockwise size={16} weight="bold" /> },
    { id: "emergency", label: "Emergency", icon: <Warning size={16} weight="bold" />, authOnly: true },
  ];

  // ── Render ──

  return (
    <div className="admin-panel">
      {/* Sidebar */}
      <aside className="admin-panel__sidebar">
        <div className="admin-panel__sidebar-header">
          <div style={{ fontSize: "1.2rem", fontWeight: 800 }}>◈ Admin</div>
          <div className="admin-panel__role-badge" data-role={data.role}>{data.role.toUpperCase()}</div>
        </div>

        <nav className="admin-panel__nav">
          {tabs.map(t => {
            if (t.authOnly && !isAuth) return null;
            return (
              <button
                key={t.id}
                className={`admin-panel__nav-item ${tab === t.id ? "admin-panel__nav-item--active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="admin-panel__logout" onClick={handleLogout}>
          <Power size={14} weight="bold" /> Logout
        </button>
      </aside>

      <main className="admin-panel__main">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Platform Overview</h2>

            {data.platform.emergencyFreeze && (
              <div className="admin-panel__alert admin-panel__alert--danger">
                PLATFORM FROZEN — {data.platform.freezeReason}
              </div>
            )}

            <div className="admin-panel__metrics">
              <MetricCard value={data.treasury.balance.toFixed(4)} label="Treasury SOL" />
              <MetricCard value={data.finance.totalRevenueSol.toFixed(4)} label="Revenue Earned" borderColor="#22c55e" />
              <MetricCard value={data.metrics.totalCreators} label="Creators" />
              <MetricCard value={data.metrics.totalHolders} label="Active Holders" />
              <MetricCard value={data.metrics.totalVolumeSol} label="Trade Volume (SOL)" />
              <MetricCard value={data.finance.trades.totalTrades} label="Total Trades" />
              <MetricCard value={data.finance.drops.totalDrops} label="Drops Created" />
              <MetricCard value={data.metrics.totalPosts} label="Inner Circle Posts" />
              <MetricCard value={data.metrics.activeWarnings} label="Active Warnings" />
              <MetricCard value={data.metrics.suspendedCreators} label="Suspended" borderColor={data.metrics.suspendedCreators > 0 ? "#ef4444" : undefined} />
              <MetricCard value={data.metrics.hiddenPosts} label="Hidden Posts" borderColor={data.metrics.hiddenPosts > 0 ? "#f59e0b" : undefined} />
            </div>

            <h3 style={{ fontSize: "0.85rem", fontWeight: 800, textTransform: "uppercase", marginTop: 32, marginBottom: 16 }}>
              Recent Actions
            </h3>
            <AuditTable actions={data.recentActions.slice(0, 20)} compact />
          </div>
        )}

        {/* ── FINANCE ── */}
        {tab === "finance" && isAuth && (() => {
          const t = data.finance?.trades ?? { totalVolumeSol: 0, buyVolumeSol: 0, sellVolumeSol: 0, totalTrades: 0, totalBuys: 0, totalSells: 0, treasuryFromBuysSol: 0, treasuryFromSellsSol: 0, treasuryTotalSol: 0, creatorFeesSol: 0, kDeepeningSol: 0, totalFeesSol: 0, founderBuyFeesNote: "" };
          const d = data.finance?.drops ?? { totalDrops: 0, activeDrops: 0, totalPurchases: 0, totalPaidSol: 0, protocolFeeSol: 0, creatorRevenueSol: 0 };
          return (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Finance & Revenue</h2>

            {/* Revenue Summary */}
            <div className="admin-panel__metrics">
              <MetricCard value={data.treasury.balance.toFixed(4)} label="Treasury Wallet (SOL)" />
              <MetricCard value={(data.finance?.totalRevenueSol ?? 0).toFixed(6)} label="Total Platform Revenue" borderColor="#22c55e" />
              <MetricCard value={(t.treasuryTotalSol ?? 0).toFixed(6)} label="From Trades" />
              <MetricCard value={(d.protocolFeeSol ?? 0).toFixed(6)} label="From Drops (15%)" />
            </div>

            {/* Trade Fees Breakdown */}
            <div className="admin-panel__emergency-card" style={{ marginTop: 24 }}>
              <h3><ArrowsDownUp size={20} /> Trade Fee Breakdown (v3.7 Asymmetric)</h3>
              <p style={{ marginBottom: 16 }}>Buy: 3% creator + 1% treasury + 1% depth — Sell: 1% creator + 3% treasury + 1% depth</p>
              <div className="admin-panel__table-wrapper">
                <table className="admin-panel__table">
                  <tbody>
                    <tr><td>Buy Volume</td><td style={{ textAlign: "right", fontWeight: 800 }}>{(t.buyVolumeSol ?? 0).toFixed(4)} SOL ({t.totalBuys ?? 0} buys)</td></tr>
                    <tr><td>Sell Volume</td><td style={{ textAlign: "right", fontWeight: 800 }}>{(t.sellVolumeSol ?? 0).toFixed(4)} SOL ({t.totalSells ?? 0} sells)</td></tr>
                    <tr style={{ borderTop: "1px solid #333" }}><td>Total Volume</td><td style={{ textAlign: "right", fontWeight: 800 }}>{(t.totalVolumeSol ?? 0).toFixed(4)} SOL ({t.totalTrades ?? 0} trades)</td></tr>
                    <tr style={{ borderTop: "2px solid #444", background: "#111" }}><td colSpan={2} style={{ fontWeight: 800, color: "#888", fontSize: "0.75rem", textTransform: "uppercase" }}>Treasury Revenue (Your Wallet)</td></tr>
                    <tr><td>From Buys (1% of buy volume)</td><td style={{ textAlign: "right", color: "#22c55e", fontWeight: 800 }}>{(t.treasuryFromBuysSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr><td>From Sells (3% of sell volume)</td><td style={{ textAlign: "right", color: "#22c55e", fontWeight: 800 }}>{(t.treasuryFromSellsSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr style={{ borderTop: "2px solid #333" }}><td style={{ fontWeight: 800 }}>Treasury Total</td><td style={{ textAlign: "right", color: "#22c55e", fontWeight: 800 }}>{(t.treasuryTotalSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr style={{ borderTop: "2px solid #444", background: "#111" }}><td colSpan={2} style={{ fontWeight: 800, color: "#888", fontSize: "0.75rem", textTransform: "uppercase" }}>Other Fee Destinations (Info Only)</td></tr>
                    <tr><td>Creator Fee Vaults (3% buy + 1% sell)</td><td style={{ textAlign: "right", color: "#888" }}>{(t.creatorFeesSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr><td>k-Deepening (1% all trades, non-extractible)</td><td style={{ textAlign: "right", color: "#888" }}>{(t.kDeepeningSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr><td style={{ color: "#f59e0b" }}>⚠ Founder Buy fees (2% at creation)</td><td style={{ textAlign: "right", color: "#888", fontSize: "0.75rem" }}>Not tracked in DB</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Drop Fees Breakdown */}
            <div className="admin-panel__emergency-card" style={{ marginTop: 24 }}>
              <h3><Package size={20} /> Drop Revenue Breakdown</h3>
              <p style={{ marginBottom: 16 }}>15% protocol fee on each exclusive drop purchase</p>
              <div className="admin-panel__table-wrapper">
                <table className="admin-panel__table">
                  <tbody>
                    <tr><td>Total Drops Created</td><td style={{ textAlign: "right" }}>{d.totalDrops ?? 0} ({d.activeDrops ?? 0} active)</td></tr>
                    <tr><td>Total Drop Purchases</td><td style={{ textAlign: "right" }}>{d.totalPurchases ?? 0}</td></tr>
                    <tr><td>Total Paid by Buyers</td><td style={{ textAlign: "right", fontWeight: 800 }}>{(d.totalPaidSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr><td>Creator Revenue (85%)</td><td style={{ textAlign: "right" }}>{(d.creatorRevenueSol ?? 0).toFixed(6)} SOL</td></tr>
                    <tr style={{ borderTop: "2px solid #333" }}><td style={{ fontWeight: 800 }}>Humanofi Fee (15%)</td><td style={{ textAlign: "right", color: "#22c55e", fontWeight: 800 }}>{(d.protocolFeeSol ?? 0).toFixed(6)} SOL</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Treasury Wallet */}
            <div className="admin-panel__emergency-card" style={{ marginTop: 24 }}>
              <h3><CurrencyDollar size={20} /> Treasury Wallet</h3>
              <p style={{ marginBottom: 8 }}>
                On-chain balance of the treasury wallet. Includes fees earned + initial SOL + devnet airdrops.
              </p>
              <div style={{ padding: "12px 16px", background: "#1a1a1a", border: "1px solid #333", fontFamily: "monospace", fontSize: "0.8rem", color: "#888", wordBreak: "break-all" }}>
                {data.treasury.wallet}
              </div>
              <div style={{ marginTop: 12, fontSize: "1.4rem", fontWeight: 800, color: "#fff" }}>
                {data.treasury.balance.toFixed(6)} SOL
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── CONTENT ── */}
        {tab === "content" && (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Content Moderation</h2>
            <ReasonInput value={actionReason} onChange={setActionReason} />

            <h3 style={{ fontSize: "0.85rem", fontWeight: 800, marginTop: 24, marginBottom: 12 }}>
              POSTS ({posts.length})
            </h3>
            <div className="admin-panel__table-wrapper">
              <table className="admin-panel__table">
                <thead>
                  <tr><th>Date</th><th>Creator Mint</th><th>Content</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {posts.map(p => (
                    <tr key={p.id} style={{ opacity: p.is_hidden ? 0.5 : 1 }}>
                      <td>{new Date(p.created_at).toLocaleDateString()}</td>
                      <td><code>{p.creator_mint.slice(0, 8)}...</code></td>
                      <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.content}</td>
                      <td>{p.is_hidden ? <span style={{ color: "#ef4444" }}>Hidden</span> : <span style={{ color: "#22c55e" }}>Visible</span>}</td>
                      <td>
                        {p.is_hidden ? (
                          <button className="admin-panel__action-btn" onClick={() => executeAction("unhide_post", p.id, actionReason || "Restored")}>
                            <Eye size={14} /> Unhide
                          </button>
                        ) : (
                          <button className="admin-panel__action-btn admin-panel__action-btn--danger" onClick={() => executeAction("hide_post", p.id, actionReason)}>
                            <EyeSlash size={14} /> Hide
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CREATORS ── */}
        {tab === "creators" && (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Creator Management</h2>
            <ReasonInput value={actionReason} onChange={setActionReason} />

            <div className="admin-panel__table-wrapper">
              <table className="admin-panel__table">
                <thead>
                  <tr><th>Name</th><th>Category</th><th>Score</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {creators.map(c => (
                    <tr key={c.mint_address}>
                      <td><strong>{c.display_name}</strong></td>
                      <td>{c.category}</td>
                      <td>{c.activity_score}</td>
                      <td>
                        {c.is_suspended
                          ? <span style={{ color: "#ef4444" }}>Suspended</span>
                          : <span style={{ color: "#22c55e" }}>Active</span>}
                      </td>
                      <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        <button className="admin-panel__action-btn" onClick={() => executeAction("warn_creator", c.mint_address, actionReason, { severity: "warning", warningType: "other" })}>
                          <Warning size={14} /> Warn
                        </button>
                        {isAuth && (
                          c.is_suspended ? (
                            <button className="admin-panel__action-btn" onClick={() => executeAction("unsuspend_token", c.mint_address, actionReason || "Reinstated")}>
                              <CheckCircle size={14} /> Unsuspend
                            </button>
                          ) : (
                            <button className="admin-panel__action-btn admin-panel__action-btn--danger" onClick={() => executeAction("suspend_token", c.mint_address, actionReason)}>
                              <Prohibit size={14} /> Suspend
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── MODERATORS ── */}
        {tab === "moderators" && isAuth && (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Manage Moderators</h2>

            <div className="admin-panel__form">
              <h3 style={{ fontSize: "0.85rem", fontWeight: 800, marginBottom: 12 }}>ADD NEW MODERATOR</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input className="admin-login__input" placeholder="Wallet address" value={newModWallet} onChange={e => setNewModWallet(e.target.value)} />
                <input className="admin-login__input" placeholder="Label (optional)" value={newModLabel} onChange={e => setNewModLabel(e.target.value)} />
              </div>
              <input className="admin-login__input" type="password" placeholder="Initial password" value={newModPassword} onChange={e => setNewModPassword(e.target.value)} style={{ marginTop: 12 }} />
              <button className="btn-solid" onClick={addModerator} style={{ marginTop: 12, background: "var(--accent)" }}>
                <UserPlus size={14} weight="bold" /> Add Moderator
              </button>
            </div>

            <div className="admin-panel__table-wrapper" style={{ marginTop: 32 }}>
              <table className="admin-panel__table">
                <thead>
                  <tr><th>Wallet</th><th>Label</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {moderators.map(m => (
                    <tr key={m.wallet_address}>
                      <td><code>{m.wallet_address.slice(0, 8)}...{m.wallet_address.slice(-4)}</code></td>
                      <td>{m.label || "—"}</td>
                      <td><span className="admin-panel__role-badge" data-role={m.role}>{m.role.toUpperCase()}</span></td>
                      <td>{m.is_active ? <span style={{ color: "#22c55e" }}>Active</span> : <span style={{ color: "#ef4444" }}>Revoked</span>}</td>
                      <td>{m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : "Never"}</td>
                      <td>
                        {m.is_active && m.role !== "authority" ? (
                          <button className="admin-panel__action-btn admin-panel__action-btn--danger" onClick={() => revokeModerator(m.wallet_address)}>
                            <Trash size={14} /> Revoke
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── AUDIT LOG ── */}
        {tab === "audit" && (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Audit Log</h2>
            <AuditTable actions={data.recentActions} />
          </div>
        )}

        {/* ── EMERGENCY ── */}
        {tab === "emergency" && isAuth && (
          <div className="admin-panel__section">
            <h2 className="admin-panel__section-title">Emergency Controls</h2>

            <div className="admin-panel__alert admin-panel__alert--warning">
              These actions affect the entire platform. Use with extreme caution.
            </div>

            <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 24 }}>
              <div className="admin-panel__emergency-card">
                <h3>{data.platform.emergencyFreeze ? <LockOpen size={20} /> : <Lock size={20} />} Platform Freeze</h3>
                <p>
                  {data.platform.emergencyFreeze
                    ? `Platform is currently FROZEN. Reason: ${data.platform.freezeReason}`
                    : "Platform is operating normally."}
                </p>
                <input
                  type="text"
                  placeholder="Reason..."
                  value={actionReason}
                  onChange={e => setActionReason(e.target.value)}
                  className="admin-login__input"
                  style={{ marginTop: 12 }}
                />
                {data.platform.emergencyFreeze ? (
                  <button className="btn-solid" style={{ marginTop: 12, background: "#22c55e" }} onClick={() => executeAction("emergency_unfreeze", "", actionReason || "Unfrozen")}>
                    Unfreeze Platform
                  </button>
                ) : (
                  <button className="btn-solid" style={{ marginTop: 12, background: "#ef4444" }} onClick={() => executeAction("emergency_freeze", "", actionReason)}>
                    FREEZE PLATFORM
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Reusable sub-components ──

function MetricCard({ value, label, borderColor }: { value: string | number; label: string; borderColor?: string }) {
  return (
    <div className="admin-panel__metric" style={borderColor ? { borderColor } : undefined}>
      <div className="admin-panel__metric-value">{value}</div>
      <div className="admin-panel__metric-label">{label}</div>
    </div>
  );
}

function ReasonInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="admin-panel__action-bar">
      <input
        type="text"
        placeholder="Reason for action..."
        value={value}
        onChange={e => onChange(e.target.value)}
        className="admin-login__input"
        style={{ flex: 1 }}
      />
    </div>
  );
}

function AuditTable({ actions, compact }: { actions: AuditEntry[]; compact?: boolean }) {
  return (
    <div className="admin-panel__table-wrapper">
      <table className="admin-panel__table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            {!compact && <th>Type</th>}
            {!compact && <th>Target</th>}
            <th>By</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {actions.map(a => (
            <tr key={a.id}>
              <td style={{ whiteSpace: "nowrap" }}>{new Date(a.created_at).toLocaleString()}</td>
              <td><code>{a.action_type}</code></td>
              {!compact && <td>{a.target_type}</td>}
              {!compact && <td><code>{a.target_id?.slice(0, 8) || "—"}...</code></td>}
              <td><code>{a.moderator_wallet.slice(0, 6)}...</code></td>
              <td>{a.reason || "—"}</td>
            </tr>
          ))}
          {actions.length === 0 && (
            <tr><td colSpan={compact ? 4 : 6} style={{ textAlign: "center", color: "var(--text-muted)" }}>No actions yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
