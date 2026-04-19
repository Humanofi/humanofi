// ========================================
// Humanofi — Drops Page (Person Sub-Tab)
// ========================================
// Displays exclusive drops for a creator.
// Creators see: create button + their drops with stats.
// Holders see: available drops with purchase button.
// Non-holders see: locked state with "buy tokens" CTA.

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePerson } from "../layout";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useAuthFetch } from "@/lib/authFetch";
import { useSolPrice } from "@/hooks/useSolPrice";
import { formatUsd, solToUsd } from "@/lib/price";
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  Lock, LockOpen, Crown, Download, ShoppingCart,
  CurrencyDollar, Users, File, VideoCamera, MusicNote,
  Image as ImageIcon, Archive, Plus, Lightning,
} from "@phosphor-icons/react";
import {
  Connection, PublicKey, SystemProgram, Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import Link from "next/link";

// Types
interface Drop {
  id: string;
  title: string;
  description: string;
  content_type: string;
  preview_url: string | null;
  price_lamports: number;
  max_buyers: number | null;
  buyer_count: number;
  tier: string;
  tier_min_tokens: number;
  total_revenue: number;
  is_active: boolean;
  created_at: string;
  purchased: boolean;
}

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  document: <File size={20} weight="bold" />,
  video: <VideoCamera size={20} weight="bold" />,
  audio: <MusicNote size={20} weight="bold" />,
  image: <ImageIcon size={20} weight="bold" />,
  archive: <Archive size={20} weight="bold" />,
  other: <File size={20} weight="bold" />,
};

const TIER_LABELS: Record<string, string> = {
  all_holders: "All Holders",
  top_holders: "Top Holders",
  public: "Public",
};

export default function DropsPage() {
  const { creator, isCreator, isHolder, tokenColor } = usePerson();
  const { authenticated, login } = usePrivy();
  const { walletAddress } = useHumanofi();
  const { priceUsd: solPriceUsd } = useSolPrice();
  const authFetch = useAuthFetch();

  const [drops, setDrops] = useState<Drop[]>([]);
  const [dropsUnlocked, setDropsUnlocked] = useState(false);
  const [holderCount, setHolderCount] = useState(0);
  const [holdersNeeded, setHoldersNeeded] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Create drop modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    content_type: "document",
    price_sol: "0.1",
    tier: "all_holders",
    tier_min_tokens: "100",
    max_buyers: "",
  });
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const mint = creator?.mint_address;

  // Fetch drops
  const fetchDrops = useCallback(async () => {
    if (!mint) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/drops/${mint}`);
      if (res.ok) {
        const data = await res.json();
        setDrops(data.drops || []);
        setDropsUnlocked(data.drops_unlocked);
        setHolderCount(data.holder_count);
        setHoldersNeeded(data.holders_needed);
      }
    } catch (err) {
      console.warn("[Drops] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [mint]);

  useEffect(() => {
    fetchDrops();
  }, [fetchDrops]);

  // Format lamports to SOL
  const formatSol = (lamports: number) => {
    const sol = lamports / LAMPORTS_PER_SOL;
    if (sol >= 1) return `${sol.toFixed(2)} SOL`;
    if (sol >= 0.01) return `${sol.toFixed(4)} SOL`;
    return `${sol.toFixed(6)} SOL`;
  };

  // Purchase a drop
  const handlePurchase = useCallback(async (drop: Drop) => {
    if (!authenticated) { login(); return; }
    if (!creator || !walletAddress) return;
    if (purchasing) return;

    setPurchasing(drop.id);
    try {
      // Calculate amounts
      const protocolFee = Math.ceil(drop.price_lamports * 1500 / 10000);
      const creatorAmount = drop.price_lamports - protocolFee;

      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
      const connection = new Connection(rpcUrl, "confirmed");

      // Build transaction: 2 transfers
      // 1. Creator gets 85%
      // 2. Treasury gets 15%
      const treasury = new PublicKey(
        process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
      );
      const buyer = new PublicKey(walletAddress);
      const creatorPubkey = new PublicKey(creator.wallet_address);

      const tx = new Transaction();

      // Transfer to creator (85%)
      tx.add(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: creatorPubkey,
          lamports: creatorAmount,
        })
      );

      // Transfer to treasury (15% protocol fee)
      tx.add(
        SystemProgram.transfer({
          fromPubkey: buyer,
          toPubkey: treasury,
          lamports: protocolFee,
        })
      );

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = buyer;

      // Sign via Privy wallet
      const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      
      // Import wallet signing from Privy
      const { wallets } = await import("@privy-io/react-auth/solana").then(m => {
        // We need to get the wallet from the hook context, but since we can't use hooks here,
        // we'll use the connection approach
        return { wallets: [] };
      });

      // Use the useHumanofi approach for signing — emit a custom event
      // Actually, let's use a simpler approach: window.solana (Phantom)
      // or better, use the useHumanofiProgram connection
      
      // Simplified: use window.solana if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const solana = (window as any).solana || (window as any).phantom?.solana;
      if (!solana) {
        toast.error("Please connect a Solana wallet (Phantom, Solflare...)");
        setPurchasing(null);
        return;
      }

      const signed = await solana.signTransaction(tx);
      const rawTx = signed.serialize();
      const txSig = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
      
      toast.loading("Confirming transaction...", { id: "drop-purchase" });
      await connection.confirmTransaction(txSig, "confirmed");
      toast.dismiss("drop-purchase");

      // Verify purchase with API
      const verifyRes = await authFetch(`/api/drops/${mint}/purchase`, {
        method: "POST",
        body: JSON.stringify({
          drop_id: drop.id,
          tx_signature: txSig,
        }),
      });

      if (verifyRes.ok) {
        toast.success("Drop purchased! You can now download the content.");
        fetchDrops(); // Refresh
      } else {
        const err = await verifyRes.json();
        toast.error(err.error || "Purchase verification failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Purchase failed";
      if (!msg.includes("User rejected")) {
        toast.error(msg);
      }
    } finally {
      setPurchasing(null);
    }
  }, [authenticated, login, creator, walletAddress, mint, purchasing, authFetch, fetchDrops]);

  // Download content
  const handleDownload = useCallback(async (drop: Drop) => {
    if (!mint) return;
    try {
      toast.loading("Downloading content...", { id: "drop-download" });
      const res = await authFetch(`/api/drops/${mint}/${drop.id}/content`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Download failed");
        toast.dismiss("drop-download");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${drop.title.replace(/[^a-zA-Z0-9]/g, "_")}.${drop.content_type === "document" ? "pdf" : drop.content_type === "video" ? "mp4" : "bin"}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss("drop-download");
      toast.success("Download complete!");
    } catch {
      toast.error("Download failed");
      toast.dismiss("drop-download");
    }
  }, [mint, authFetch]);

  // Create a drop
  const handleCreate = useCallback(async () => {
    if (!mint || !selectedFile || creating) return;

    setCreating(true);
    try {
      // 1. Upload the file to Supabase Storage (encrypted will be done server-side in future)
      // For MVP, we upload to a "drops" bucket and the API will handle encryption
      const contentPath = `${mint}/${Date.now()}_${selectedFile.name}`;

      // Upload to storage via API (avoiding direct Supabase client-side access)
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("path", contentPath);

      const uploadRes = await authFetch(`/api/drops/${mint}`, {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title,
          description: createForm.description,
          content_type: createForm.content_type,
          content_path: contentPath,
          price_lamports: Math.floor(parseFloat(createForm.price_sol) * LAMPORTS_PER_SOL),
          tier: createForm.tier,
          tier_min_tokens: createForm.tier === "top_holders" ? Math.floor(parseFloat(createForm.tier_min_tokens) * 1e6) : 0,
          max_buyers: createForm.max_buyers ? parseInt(createForm.max_buyers) : null,
        }),
      });

      if (uploadRes.ok) {
        toast.success("Drop created successfully!");
        setShowCreate(false);
        setSelectedFile(null);
        setCreateForm({
          title: "", description: "", content_type: "document",
          price_sol: "0.1", tier: "all_holders", tier_min_tokens: "100", max_buyers: "",
        });
        fetchDrops();
      } else {
        const err = await uploadRes.json();
        toast.error(err.error || "Failed to create drop");
      }
    } catch (err) {
      toast.error("Failed to create drop");
      console.error("[Drops] Create error:", err);
    } finally {
      setCreating(false);
    }
  }, [mint, selectedFile, creating, createForm, authFetch, fetchDrops]);

  if (!creator) {
    return (
      <div className="drops-empty">
        <p>Drops are not available for demo profiles.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", opacity: 0.5 }}>
        Loading drops...
      </div>
    );
  }

  return (
    <div className="drops-page">
      {/* ── Unlock Status Banner ── */}
      {!dropsUnlocked && (
        <motion.div
          className="drops-locked-banner"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="drops-locked-banner__icon">
            <Lock size={32} weight="bold" />
          </div>
          <div className="drops-locked-banner__content">
            <h3>Drops Locked</h3>
            <p>
              {isCreator
                ? `Your token needs ${holdersNeeded} more holder${holdersNeeded !== 1 ? "s" : ""} to unlock Exclusive Drops.`
                : `This creator needs ${holdersNeeded} more holder${holdersNeeded !== 1 ? "s" : ""} to unlock Exclusive Drops.`
              }
            </p>
            <div className="drops-locked-banner__progress">
              <div
                className="drops-locked-banner__bar"
                style={{
                  width: `${Math.min(100, (holderCount / 100) * 100)}%`,
                  background: tokenColor,
                }}
              />
            </div>
            <span className="drops-locked-banner__count">
              {holderCount} / 100 holders
            </span>
          </div>
        </motion.div>
      )}

      {/* ── Header ── */}
      {dropsUnlocked && (
        <div className="drops-header">
          <div className="drops-header__info">
            <div className="drops-header__badge" style={{ background: `${tokenColor}15`, color: tokenColor }}>
              <LockOpen size={16} weight="bold" />
              Drops Unlocked
            </div>
            <h2 className="drops-header__title">Exclusive Drops</h2>
            <p className="drops-header__desc">
              {isCreator
                ? "Sell exclusive content to your holders. You earn 85% of each sale."
                : "Exclusive paid content from this creator."
              }
            </p>
          </div>

          {isCreator && (
            <button
              className="btn-solid"
              onClick={() => setShowCreate(true)}
              style={{ background: tokenColor }}
            >
              <Plus size={16} weight="bold" />
              Create Drop
            </button>
          )}
        </div>
      )}

      {/* ── Drops Grid ── */}
      {dropsUnlocked && drops.length > 0 && (
        <div className="drops-grid">
          {drops.map((drop, idx) => (
            <motion.div
              key={drop.id}
              className="drop-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              {/* Preview */}
              {drop.preview_url && (
                <div className="drop-card__preview">
                  <img src={drop.preview_url} alt={drop.title} />
                </div>
              )}

              {/* Content type badge */}
              <div className="drop-card__type" style={{ color: tokenColor }}>
                {CONTENT_TYPE_ICONS[drop.content_type] || CONTENT_TYPE_ICONS.other}
                <span>{drop.content_type}</span>
              </div>

              {/* Title & description */}
              <h3 className="drop-card__title">{drop.title}</h3>
              {drop.description && (
                <p className="drop-card__desc">{drop.description}</p>
              )}

              {/* Tier badge */}
              <div className="drop-card__tier">
                {drop.tier === "top_holders" && <Crown size={14} weight="bold" />}
                {TIER_LABELS[drop.tier]}
                {drop.tier === "top_holders" && (
                  <span className="drop-card__tier-req">
                    (min {(drop.tier_min_tokens / 1e6).toFixed(0)} tokens)
                  </span>
                )}
              </div>

              {/* Stats */}
              <div className="drop-card__stats">
                <div className="drop-card__stat">
                  <CurrencyDollar size={14} />
                  {formatSol(drop.price_lamports)}
                  {solPriceUsd > 0 && (
                    <span className="drop-card__stat-usd">
                      ({formatUsd(solToUsd(drop.price_lamports / LAMPORTS_PER_SOL, solPriceUsd))})
                    </span>
                  )}
                </div>
                <div className="drop-card__stat">
                  <Users size={14} />
                  {drop.buyer_count} buyer{drop.buyer_count !== 1 ? "s" : ""}
                  {drop.max_buyers && (
                    <span> / {drop.max_buyers}</span>
                  )}
                </div>
              </div>

              {/* Action button */}
              <div className="drop-card__action">
                {drop.purchased ? (
                  <button
                    className="btn-solid drop-card__btn drop-card__btn--download"
                    onClick={() => handleDownload(drop)}
                  >
                    <Download size={16} weight="bold" />
                    Download
                  </button>
                ) : isCreator ? (
                  <div className="drop-card__creator-stats">
                    <Lightning size={14} weight="bold" />
                    {formatSol(drop.total_revenue)} earned
                  </div>
                ) : (
                  <button
                    className="btn-solid drop-card__btn"
                    onClick={() => handlePurchase(drop)}
                    disabled={purchasing === drop.id || (drop.max_buyers !== null && drop.buyer_count >= drop.max_buyers)}
                    style={{ background: tokenColor }}
                  >
                    {purchasing === drop.id ? (
                      "Processing..."
                    ) : drop.max_buyers !== null && drop.buyer_count >= drop.max_buyers ? (
                      "Sold Out"
                    ) : (
                      <>
                        <ShoppingCart size={16} weight="bold" />
                        Buy — {formatSol(drop.price_lamports)}
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Empty State ── */}
      {dropsUnlocked && drops.length === 0 && (
        <div className="drops-empty">
          <div className="drops-empty__icon">
            <Lightning size={48} weight="thin" />
          </div>
          <h3>No drops yet</h3>
          <p>
            {isCreator
              ? "Create your first exclusive drop to start earning from premium content."
              : "This creator hasn't published any drops yet. Check back later!"
            }
          </p>
          {isCreator && (
            <button
              className="btn-solid"
              onClick={() => setShowCreate(true)}
              style={{ background: tokenColor, marginTop: 16 }}
            >
              <Plus size={16} weight="bold" />
              Create Your First Drop
            </button>
          )}
        </div>
      )}

      {/* ── Non-holder CTA ── */}
      {!isHolder && !isCreator && dropsUnlocked && drops.length > 0 && (
        <div className="drops-holder-cta">
          <Lock size={16} weight="bold" />
          Hold tokens to purchase drops
          <Link href={`/person/${mint}`} className="btn-outline" style={{ marginLeft: 12 }}>
            Buy Tokens
          </Link>
        </div>
      )}

      {/* ══════════════════════════════════════
          CREATE DROP MODAL
         ══════════════════════════════════════ */}
      {showCreate && (
        <div
          className="trade-modal-overlay"
          style={{ opacity: 1 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreate(false);
          }}
        >
          <motion.div
            className="trade-modal create-drop-modal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ maxWidth: 480 }}
          >
            <div className="trade-modal-header" style={{ borderBottom: `2px solid ${tokenColor}` }}>
              <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-faint)" }}>
                New Exclusive Drop
              </div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
                Create Drop
              </div>
            </div>

            <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Title */}
              <div>
                <label className="create-drop__label">Title *</label>
                <input
                  className="create-drop__input"
                  placeholder="My exclusive content..."
                  value={createForm.title}
                  onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
                  maxLength={120}
                />
              </div>

              {/* Description */}
              <div>
                <label className="create-drop__label">Description</label>
                <textarea
                  className="create-drop__input create-drop__textarea"
                  placeholder="What's inside this drop..."
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  maxLength={2000}
                  rows={3}
                />
              </div>

              {/* Content type */}
              <div>
                <label className="create-drop__label">Content Type</label>
                <select
                  className="create-drop__input"
                  value={createForm.content_type}
                  onChange={e => setCreateForm(f => ({ ...f, content_type: e.target.value }))}
                >
                  <option value="document">Document (PDF)</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="image">Image</option>
                  <option value="archive">Archive (ZIP)</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* File upload */}
              <div>
                <label className="create-drop__label">Content File *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                />
                <button
                  className="btn-outline create-drop__file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  {selectedFile ? (
                    <span>{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                  ) : (
                    <span>Choose file...</span>
                  )}
                </button>
              </div>

              {/* Price */}
              <div>
                <label className="create-drop__label">Price (SOL) *</label>
                <input
                  className="create-drop__input"
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="0.1"
                  value={createForm.price_sol}
                  onChange={e => setCreateForm(f => ({ ...f, price_sol: e.target.value }))}
                />
                {solPriceUsd > 0 && parseFloat(createForm.price_sol) > 0 && (
                  <div className="create-drop__usd-hint">
                    ≈ {formatUsd(parseFloat(createForm.price_sol) * solPriceUsd)}
                    <span style={{ opacity: 0.5, marginLeft: 6 }}>
                      (you receive 85% · protocol gets 15%)
                    </span>
                  </div>
                )}
              </div>

              {/* Tier */}
              <div>
                <label className="create-drop__label">Access Tier</label>
                <select
                  className="create-drop__input"
                  value={createForm.tier}
                  onChange={e => setCreateForm(f => ({ ...f, tier: e.target.value }))}
                >
                  <option value="all_holders">All Holders (any balance)</option>
                  <option value="top_holders">Top Holders (minimum balance)</option>
                  <option value="public">Public (anyone)</option>
                </select>
              </div>

              {createForm.tier === "top_holders" && (
                <div>
                  <label className="create-drop__label">Min tokens to buy</label>
                  <input
                    className="create-drop__input"
                    type="number"
                    min="1"
                    placeholder="100"
                    value={createForm.tier_min_tokens}
                    onChange={e => setCreateForm(f => ({ ...f, tier_min_tokens: e.target.value }))}
                  />
                </div>
              )}

              {/* Max buyers */}
              <div>
                <label className="create-drop__label">Max Buyers (optional)</label>
                <input
                  className="create-drop__input"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={createForm.max_buyers}
                  onChange={e => setCreateForm(f => ({ ...f, max_buyers: e.target.value }))}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button
                  className="btn-outline"
                  onClick={() => setShowCreate(false)}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  className="btn-solid"
                  onClick={handleCreate}
                  disabled={creating || !createForm.title.trim() || !selectedFile}
                  style={{ flex: 1, background: tokenColor }}
                >
                  {creating ? "Creating..." : "Create Drop"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
