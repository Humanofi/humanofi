"use client";

import { useState, useCallback, useRef, useEffect, useDeferredValue } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { LivePreviewCard } from "@/components/LivePreviewCard";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { useSolPrice } from "@/hooks/useSolPrice";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { toast } from "sonner";
import FilterDropdown, { type DropdownOption } from "@/components/FilterDropdown";
import Flag from "@/components/Flag";
import {
  Rocket, PaintBrush, Code, ChartLineUp, Palette, MusicNotes,
  Megaphone, Flask, Lightbulb, CurrencyDollar, PencilLine,
  Article, FilmSlate, Camera, GraduationCap, HandFist, CookingPot,
  GameController, Gear, Dna, Newspaper, User, Heart, Scales,
  Headphones, Globe, VideoCamera, Barbell, Stethoscope, Books,
} from "@phosphor-icons/react";

const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

const LAMPORTS_PER_SOL_CONST = 1_000_000_000;

// ── Fixed Creation Fee ──
const CREATION_FEE_USD = 29.99;
const HUMANOFI_FEE_USD = 15;
const TOKEN_SEED_USD = 12;

// ── Expanded categories with icons ──
const CATEGORIES: DropdownOption[] = [
  { value: "founder", label: "Founder", icon: <Rocket size={14} weight="bold" /> },
  { value: "creator", label: "Creator", icon: <PaintBrush size={14} weight="bold" /> },
  { value: "developer", label: "Developer", icon: <Code size={14} weight="bold" /> },
  { value: "trader", label: "Trader", icon: <ChartLineUp size={14} weight="bold" /> },
  { value: "artist", label: "Artist", icon: <Palette size={14} weight="bold" /> },
  { value: "musician", label: "Musician", icon: <MusicNotes size={14} weight="bold" /> },
  { value: "athlete", label: "Athlete", icon: <Barbell size={14} weight="bold" /> },
  { value: "influencer", label: "Influencer", icon: <Megaphone size={14} weight="bold" /> },
  { value: "researcher", label: "Researcher", icon: <Flask size={14} weight="bold" /> },
  { value: "thinker", label: "Thinker", icon: <Lightbulb size={14} weight="bold" /> },
  { value: "investor", label: "Investor", icon: <CurrencyDollar size={14} weight="bold" /> },
  { value: "designer", label: "Designer", icon: <PencilLine size={14} weight="bold" /> },
  { value: "writer", label: "Writer", icon: <Article size={14} weight="bold" /> },
  { value: "filmmaker", label: "Filmmaker", icon: <FilmSlate size={14} weight="bold" /> },
  { value: "photographer", label: "Photographer", icon: <Camera size={14} weight="bold" /> },
  { value: "educator", label: "Educator", icon: <GraduationCap size={14} weight="bold" /> },
  { value: "activist", label: "Activist", icon: <HandFist size={14} weight="bold" /> },
  { value: "chef", label: "Chef", icon: <CookingPot size={14} weight="bold" /> },
  { value: "streamer", label: "Streamer", icon: <GameController size={14} weight="bold" /> },
  { value: "engineer", label: "Engineer", icon: <Gear size={14} weight="bold" /> },
  { value: "scientist", label: "Scientist", icon: <Dna size={14} weight="bold" /> },
  { value: "journalist", label: "Journalist", icon: <Newspaper size={14} weight="bold" /> },
  { value: "doctor", label: "Doctor", icon: <Stethoscope size={14} weight="bold" /> },
  { value: "lawyer", label: "Lawyer", icon: <Scales size={14} weight="bold" /> },
  { value: "podcaster", label: "Podcaster", icon: <Headphones size={14} weight="bold" /> },
  { value: "vlogger", label: "Vlogger", icon: <VideoCamera size={14} weight="bold" /> },
  { value: "coach", label: "Coach", icon: <Heart size={14} weight="bold" /> },
  { value: "author", label: "Author", icon: <Books size={14} weight="bold" /> },
  { value: "diplomat", label: "Diplomat", icon: <Globe size={14} weight="bold" /> },
  { value: "other", label: "Other", icon: <User size={14} weight="bold" /> },
];

// ── Countries ──
const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "FR", name: "France" }, { code: "DE", name: "Germany" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" },
  { code: "PT", name: "Portugal" }, { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" }, { code: "CH", name: "Switzerland" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" }, { code: "KR", name: "South Korea" },
  { code: "SG", name: "Singapore" }, { code: "AE", name: "UAE" },
  { code: "BR", name: "Brazil" }, { code: "MX", name: "Mexico" },
  { code: "IN", name: "India" }, { code: "NG", name: "Nigeria" },
  { code: "ZA", name: "South Africa" }, { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" }, { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" }, { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" }, { code: "AT", name: "Austria" },
  { code: "IE", name: "Ireland" }, { code: "IL", name: "Israel" },
  { code: "AR", name: "Argentina" }, { code: "CO", name: "Colombia" },
  { code: "CL", name: "Chile" }, { code: "TH", name: "Thailand" },
  { code: "MY", name: "Malaysia" }, { code: "ID", name: "Indonesia" },
  { code: "PH", name: "Philippines" }, { code: "TW", name: "Taiwan" },
  { code: "HK", name: "Hong Kong" },
];

// Pre-built lookup Maps for O(1) access (no .find() on every render)
const CATEGORY_LABEL_MAP = new Map(CATEGORIES.map(c => [c.value, c.label]));
const COUNTRY_NAME_MAP = new Map(COUNTRIES.map(c => [c.code, c.name]));

// ── Styles ──
const labelStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  display: "block",
  marginBottom: 8,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 28,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  border: "2px solid var(--border)",
  background: "#fff",
  fontSize: "0.95rem",
  fontFamily: "var(--font-sans)",
  fontWeight: 600,
};

const charCountStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--text-muted)",
  textAlign: "right",
  marginTop: 4,
};

export default function CreatePage() {
  // Form state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [category, setCategory] = useState("");
  const [bio, setBio] = useState("");
  const [story, setStory] = useState("");
  const [offer, setOffer] = useState("");
  const [country, setCountry] = useState("");
  const [twitter, setTwitter] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  // Fixed creation fee — no more user-configurable liquidity
  const [step, setStep] = useState<"connect" | "form" | "launching" | "done">("connect");
  const [currentSection, setCurrentSection] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasDraft, setHasDraft] = useState(false);

  // Privy auth
  const { authenticated, login } = usePrivy();

  // Humanofi hook — handles Privy → Anchor bridge internally
  const { createToken, walletAddress, connected } = useHumanofi();
  const { priceUsd: solPriceUsd } = useSolPrice();
  const [launchStep, setLaunchStep] = useState(0); // 0=idle, 1=uploading, 2=creating, 3=registering, 4=done

  // ── Draft auto-save / restore (Supabase) ──
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftLoadedRef = useRef(false);

  // Restore draft from DB when wallet is available
  useEffect(() => {
    if (!walletAddress || draftLoadedRef.current) return;
    draftLoadedRef.current = true;

    fetch(`/api/drafts?wallet=${walletAddress}`)
      .then(r => r.json())
      .then(({ draft }) => {
        if (!draft) return;
        if (draft.token_name) setTokenName(draft.token_name);
        if (draft.token_symbol) setTokenSymbol(draft.token_symbol);
        if (draft.category) setCategory(draft.category);
        if (draft.bio) setBio(draft.bio);
        if (draft.story) setStory(draft.story);
        if (draft.offer) setOffer(draft.offer);
        if (draft.country) setCountry(draft.country);
        if (draft.twitter) setTwitter(draft.twitter);
        if (draft.linkedin) setLinkedin(draft.linkedin);
        if (draft.website) setWebsite(draft.website);
        if (draft.instagram) setInstagram(draft.instagram);
        // initial_liquidity_usd no longer restored (fixed fee now)
        if (draft.current_section !== undefined && draft.current_section !== null) setCurrentSection(draft.current_section);
        setHasDraft(true);
        toast.success("Draft restored");
      })
      .catch(() => { /* silently fail */ });
  }, [walletAddress]);

  // Auto-save draft to DB (debounced 2s)
  useEffect(() => {
    if (!walletAddress || step !== "form") return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const hasData = tokenName || tokenSymbol || category || bio || story || offer || country;
      if (!hasData) return;
      fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          tokenName, tokenSymbol, category, bio, story, offer, country,
          twitter, linkedin, website, instagram, currentSection,
        }),
      }).then(() => setHasDraft(true)).catch(() => {});
    }, 2000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [tokenName, tokenSymbol, category, bio, story, offer, country, twitter, linkedin, website, instagram, currentSection, step, walletAddress]);

  const clearDraft = useCallback(() => {
    if (walletAddress) {
      fetch(`/api/drafts?wallet=${walletAddress}`, { method: "DELETE" }).catch(() => {});
    }
    setHasDraft(false);
    setTokenName(""); setTokenSymbol(""); setCategory(""); setBio("");
    setStory(""); setOffer(""); setCountry(""); setTwitter("");
    setLinkedin(""); setWebsite(""); setInstagram("");
    setAvatarPreview(null); setAvatarFile(null);
    setCurrentSection(0);
    toast.success("Draft cleared");
  }, [walletAddress]);

  // Auto-switch to form when authenticated
  useEffect(() => {
    if (authenticated && step === "connect") {
      setStep("form");
    }
  }, [authenticated, step]);

  // Deferred values for the preview card — keeps form inputs snappy
  const deferredName = useDeferredValue(tokenName);
  const deferredSymbol = useDeferredValue(tokenSymbol);
  const deferredBio = useDeferredValue(bio);
  const deferredCategory = useDeferredValue(category);
  const deferredCountry = useDeferredValue(country);
  const deferredAvatar = useDeferredValue(avatarPreview);

  // Pre-resolved lookups (primitive strings for memo comparison)
  const deferredCategoryLabel = CATEGORY_LABEL_MAP.get(deferredCategory) || "";
  const deferredCountryName = COUNTRY_NAME_MAP.get(deferredCountry) || "";

  // Handle avatar selection — use objectURL for instant lag-free preview
  const handleAvatarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }

    // Revoke previous objectURL to prevent memory leak
    if (avatarPreview && avatarPreview.startsWith("blob:")) {
      URL.revokeObjectURL(avatarPreview);
    }

    setAvatarFile(file);
    // createObjectURL returns a tiny blob: URL (not multi-MB base64!)
    setAvatarPreview(URL.createObjectURL(file));
  }, [avatarPreview]);

  const handleLaunch = useCallback(async () => {
    if (!tokenName || tokenName.length < 2 || tokenName.length > 32) {
      toast.error("Token name must be 2-32 characters.");
      return;
    }
    if (!tokenSymbol || tokenSymbol.length < 2 || tokenSymbol.length > 10) {
      toast.error("Token symbol must be 2-10 characters.");
      return;
    }
    if (!category) {
      toast.error("Please select a category.");
      return;
    }
    if (!bio || bio.length < 20) {
      toast.error("Bio must be at least 20 characters.");
      return;
    }
    if (!avatarPreview) {
      toast.error("Please upload a profile photo.");
      return;
    }

    setStep("launching");
    setLaunchStep(1);

    try {
      // ── STEP 1: Upload avatar + create metadata ──
      toast.info("Uploading your photo...");

      // Build FormData with the actual file (no base64!)
      const formData = new FormData();
      formData.append("avatar", avatarFile!);
      formData.append("tokenName", tokenName);
      formData.append("tokenSymbol", tokenSymbol.toUpperCase());
      formData.append("category", category);
      formData.append("bio", bio);
      formData.append("story", story);
      formData.append("offer", offer);
      formData.append("country", country);
      formData.append("walletAddress", walletAddress || "");
      formData.append("socials", JSON.stringify({
        ...(twitter && { twitter }),
        ...(linkedin && { linkedin }),
        ...(website && { website }),
        ...(instagram && { instagram }),
      }));

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        const err = await uploadResponse.json();
        toast.error(`Upload failed: ${err.error}`);
        setStep("form");
        setLaunchStep(0);
        return;
      }

      const { avatarUrl, metadataUrl } = await uploadResponse.json();
      toast.success("Photo uploaded!");

      // ── STEP 2: Create token on-chain ──
      setLaunchStep(2);

      // ── Build Humanofi creation fee transfer (atomic with createToken) ──
      const humanofiFeeLamports = Math.floor((HUMANOFI_FEE_USD / solPriceUsd) * LAMPORTS_PER_SOL_CONST);
      const tokenSeedLamports = Math.floor((TOKEN_SEED_USD / solPriceUsd) * LAMPORTS_PER_SOL_CONST);

      const feeTransferIx = SystemProgram.transfer({
        fromPubkey: new PublicKey(walletAddress!),
        toPubkey: TREASURY,
        lamports: humanofiFeeLamports,
      });

      const result = await createToken({
        name: tokenName,
        symbol: tokenSymbol.toUpperCase(),
        uri: metadataUrl,
        initialLiquidity: tokenSeedLamports,
        treasury: TREASURY,
        preInstructions: [feeTransferIx],
      });

      if (!result) {
        setStep("form");
        setLaunchStep(0);
        return;
      }

      // ── STEP 3: Register creator profile in Supabase ──
      setLaunchStep(3);

      try {
        await fetch("/api/creators", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mintAddress: result.mint.toBase58(),
            walletAddress,
            displayName: tokenName,
            tokenSymbol: tokenSymbol.toUpperCase(),
            category,
            bio,
            avatarUrl,
            story,
            offer,
            country,
            socials: {
              ...(twitter && { twitter }),
              ...(linkedin && { linkedin }),
              ...(website && { website }),
              ...(instagram && { instagram }),
            },
          }),
        });
      } catch (err) {
        console.error("Failed to register creator profile:", err);
        // Non-blocking — token is already created on-chain
      }

      // ── STEP 3.5: Record Founder Buy as a trade ──
      // This makes the sparkline chart show the initial price movement
      // and the creator appear as the first holder.
      try {
        const mintPk = result.mint.toBase58();
        const solLamports = Math.floor((TOKEN_SEED_USD / solPriceUsd) * LAMPORTS_PER_SOL_CONST);

        // Estimate post-creation price from curve math
        // Founder Buy fee = 3% → sol_to_curve ≈ 97% of V
        const founderFeeRate = 0.03;
        const solToCurve = solLamports * (1 - founderFeeRate);
        // x = D + sol_to_curve, where D = 20 × V
        const depthRatio = 18;
        const initialX = depthRatio * solLamports + solToCurve;
        const initialY = 1_000_000 * 1_000_000; // 1M tokens in base units
        const spotPriceAfter = (initialX / initialY) * 1_000_000; // lamports per whole token

        await fetch("/api/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mintAddress: mintPk,
            tradeType: "buy",
            walletAddress: walletAddress,
            solAmount: solLamports,
            tokenAmount: 0, // Will be filled by API from on-chain data
            priceSol: spotPriceAfter / 1e9, // Convert lamports to SOL
            txSignature: result.signature,
            xAfter: initialX,
            yAfter: initialY,
            kAfter: initialX * initialY,
            solReserve: solLamports,
            supplyPublic: 0,
          }),
        });
      } catch (err) {
        console.warn("[Create] Failed to record founder buy trade:", err);
        // Non-blocking
      }

      setLaunchStep(4);
      setStep("done");
      if (walletAddress) fetch(`/api/drafts?wallet=${walletAddress}`, { method: "DELETE" }).catch(() => {}); // Clear draft on success
      toast.success(`Token $${tokenSymbol.toUpperCase()} created!`);
    } catch {
      setStep("form");
      setLaunchStep(0);
    }
  }, [tokenName, tokenSymbol, category, bio, avatarPreview, avatarFile, story, offer, country, twitter, linkedin, website, instagram, solPriceUsd, createToken, walletAddress]);

  // Form sections for step-by-step flow
  const sections = [
    { title: "Identity", subtitle: "Photo & basic info" },
    { title: "About You", subtitle: "Your story & vision" },
    { title: "Socials", subtitle: "Connect your presence" },
    { title: "Review", subtitle: "Final check" },
  ];

  const canProceed = () => {
    switch (currentSection) {
      case 0: return tokenName.length >= 2 && tokenSymbol.length >= 2 && category && avatarPreview;
      case 1: return bio.length >= 20;
      case 2: return true; // Socials are optional
      case 3: return true;
      default: return false;
    }
  };

  return (
    <>
      <div className="halftone-bg" />
      <Topbar />
      <main className="page">
        <div className="page__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 className="page__title">Create Your Personal Token on Solana</h1>
            <p className="page__subtitle">
              One token per human. Verified. Permanent. Impossible to duplicate.
            </p>
          </div>
          {hasDraft && step === "form" && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 16px",
              border: "2px solid var(--border)",
              background: "#f0fdf4",
              fontSize: "0.75rem",
              fontWeight: 700,
            }}>
              <span style={{ color: "#16a34a" }}>Draft saved</span>
              <button
                onClick={clearDraft}
                style={{
                  background: "none", border: "none", color: "var(--text-muted)",
                  fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Clear draft
              </button>
            </div>
          )}
        </div>

        {/* ── STEP: CONNECT ── */}
        {step === "connect" && (
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div className="trade-widget" style={{ marginBottom: 32, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: "2.4rem", marginBottom: 16 }}>◈</div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 12 }}>
                Start by connecting your wallet
              </h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}>
                Creating your token requires identity verification
                and a deployment transaction on Solana.
              </p>
              <button className="btn-solid" style={{ background: "var(--accent)" }} onClick={login}>
                Connect Wallet
              </button>
            </div>

            <div style={{ border: "2px solid var(--border)", background: "#fff", padding: 32 }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 24, paddingBottom: 16, borderBottom: "2px solid var(--border)" }}>
                Creation Process
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {[
                  { step: "01", title: "Connect Wallet", desc: "Phantom, Email, or Twitter via Privy" },
                  { step: "02", title: "KYC Verification", desc: "ID scan + facial biometrics via Didit (free & instant)" },
                  { step: "03", title: "Build Your Profile", desc: "Photo, bio, story, socials — show who you are" },
                  { step: "04", title: "Launch", desc: "Token created, 100M supply locked, bonding curve live" },
                ].map((s) => (
                  <div key={s.step} style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>
                      {s.step}
                    </div>
                    <div>
                      <div style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 4 }}>
                        {s.title}
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: FORM ── */}
        {step === "form" && (
          <div className="create-layout">

            {/* Left: Form */}
            <div>
              {/* Progress bar */}
              <div style={{ display: "flex", gap: 0, marginBottom: 32 }}>
                {sections.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSection(i)}
                    style={{
                      flex: 1,
                      padding: "12px 8px",
                      border: "2px solid var(--border)",
                      borderRight: i < sections.length - 1 ? "none" : "2px solid var(--border)",
                      background: i === currentSection ? "var(--accent)" : i < currentSection ? "#e8f0ff" : "#fff",
                      color: i === currentSection ? "#fff" : "var(--text)",
                      fontWeight: 800,
                      fontSize: "0.72rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                  >
                    <div>{s.title}</div>
                    <div style={{ fontSize: "0.62rem", fontWeight: 500, opacity: 0.7, marginTop: 2 }}>{s.subtitle}</div>
                  </button>
                ))}
              </div>

              {/* Section 0: Identity */}
              {currentSection === 0 && (
                <div className="trade-widget" style={{ padding: 36 }}>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 28, paddingBottom: 16, borderBottom: "2px solid var(--border)" }}>
                    Your Identity
                  </h2>

                  {/* Avatar Upload */}
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Profile Photo *</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: 140,
                        height: 140,
                        border: avatarPreview ? "3px solid var(--accent)" : "3px dashed var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        overflow: "hidden",
                        background: avatarPreview ? "none" : "#f8f8f8",
                        transition: "border-color 0.2s",
                        position: "relative",
                      }}
                    >
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 4 }}>+</div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                            Upload photo
                          </div>
                          <div style={{ fontSize: "0.6rem", color: "var(--text-muted)" }}>
                            Max 5MB
                          </div>
                        </div>
                      )}
                      {avatarPreview && (
                        <div style={{
                          position: "absolute",
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: "rgba(0,0,0,0.7)",
                          color: "#fff",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          padding: "6px 0",
                          textAlign: "center",
                        }}>
                          CHANGE
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      style={{ display: "none" }}
                    />
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 8 }}>
                      This photo will represent your token on the marketplace. Use a clear, professional headshot.
                    </div>
                  </div>

                  {/* Token Name */}
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Token Name *</label>
                    <input
                      type="text"
                      style={inputStyle}
                      placeholder="Your full name (e.g. Alice Dubois)"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      maxLength={32}
                    />
                    <div style={charCountStyle}>{tokenName.length}/32</div>
                  </div>

                  {/* Token Symbol */}
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Token Symbol *</label>
                    <input
                      type="text"
                      style={{ ...inputStyle, textTransform: "uppercase" }}
                      placeholder="e.g. ALICE"
                      value={tokenSymbol}
                      onChange={(e) => setTokenSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                      maxLength={10}
                    />
                    <div style={charCountStyle}>{tokenSymbol.length}/10</div>
                  </div>

                  {/* Category */}
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Category *</label>
                    <FilterDropdown
                      label=""
                      options={CATEGORIES}
                      value={category}
                      onChange={setCategory}
                    />
                  </div>

                  {/* Country */}
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Country</label>
                    <FilterDropdown
                      label=""
                      options={[
                        { value: "", label: "Select your country" },
                        ...COUNTRIES.map((c) => ({
                          value: c.code,
                          label: c.name,
                          icon: <Flag code={c.code} size={13} />,
                        })),
                      ]}
                      value={country}
                      onChange={setCountry}
                    />
                  </div>
                </div>
              )}

              {/* Section 1: About You */}
              {currentSection === 1 && (
                <div className="trade-widget" style={{ padding: 36 }}>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 28, paddingBottom: 16, borderBottom: "2px solid var(--border)" }}>
                    About You
                  </h2>

                  <div style={sectionStyle}>
                    <label style={labelStyle}>Bio *</label>
                    <textarea
                      style={{ ...inputStyle, resize: "vertical", minHeight: 100 }}
                      placeholder="A short description of who you are and what you do. This appears on your card in the marketplace."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      maxLength={280}
                    />
                    <div style={charCountStyle}>{bio.length}/280</div>
                  </div>

                  <div style={sectionStyle}>
                    <label style={labelStyle}>Your Story</label>
                    <textarea
                      style={{ ...inputStyle, resize: "vertical", minHeight: 140 }}
                      placeholder="Tell your story. What drives you? What have you accomplished? Why should people believe in your potential? Be genuine — investors want to know the real you."
                      value={story}
                      onChange={(e) => setStory(e.target.value)}
                      maxLength={2000}
                    />
                    <div style={charCountStyle}>{story.length}/2000</div>
                  </div>

                  <div style={sectionStyle}>
                    <label style={labelStyle}>What You Offer Token Holders</label>
                    <textarea
                      style={{ ...inputStyle, resize: "vertical", minHeight: 100 }}
                      placeholder="What do holders get? Early access to your content? 1-on-1 calls? Private Discord? Alpha? Be specific about the value you provide."
                      value={offer}
                      onChange={(e) => setOffer(e.target.value)}
                      maxLength={1000}
                    />
                    <div style={charCountStyle}>{offer.length}/1000</div>
                  </div>
                </div>
              )}

              {/* Section 2: Socials */}
              {currentSection === 2 && (
                <div className="trade-widget" style={{ padding: 36 }}>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 28, paddingBottom: 16, borderBottom: "2px solid var(--border)" }}>
                    Social Links
                  </h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 28 }}>
                    Add your social profiles so investors can verify your identity and follow your work. All fields are optional.
                  </p>

                  {[
                    { label: "Twitter / X", value: twitter, set: setTwitter, placeholder: "@yourhandle", icon: "𝕏" },
                    { label: "LinkedIn", value: linkedin, set: setLinkedin, placeholder: "https://linkedin.com/in/yourprofile", icon: "in" },
                    { label: "Instagram", value: instagram, set: setInstagram, placeholder: "@yourhandle", icon: "IG" },
                    { label: "Website", value: website, set: setWebsite, placeholder: "https://yourwebsite.com", icon: "WEB" },
                  ].map((social) => (
                    <div key={social.label} style={sectionStyle}>
                      <label style={labelStyle}>{social.label}</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          border: "2px solid var(--border)",
                          borderRight: "none",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: "0.9rem",
                          background: "#f5f5f5",
                          flexShrink: 0,
                        }}>
                          {social.icon}
                        </div>
                        <input
                          type="text"
                          style={{ ...inputStyle, flex: 1 }}
                          placeholder={social.placeholder}
                          value={social.value}
                          onChange={(e) => social.set(e.target.value)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Section 3: Review */}
              {currentSection === 3 && (
                <div className="trade-widget" style={{ padding: 36 }}>
                  <h2 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 28, paddingBottom: 16, borderBottom: "2px solid var(--border)" }}>
                    Review & Launch
                  </h2>

                  {/* Summary */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 28 }}>
                    {[
                      { label: "Token", value: `${tokenName} ($${tokenSymbol})` },
                      { label: "Category", value: CATEGORIES.find((c) => c.value === category)?.label || "—" },
                      { label: "Country", value: COUNTRIES.find((c) => c.code === country)?.name || "Not set" },
                      { label: "Bio", value: bio ? `${bio.slice(0, 80)}...` : "—" },
                      { label: "Story", value: story ? "✅ Written" : "❌ Missing (recommended)" },
                      { label: "Offer", value: offer ? "✅ Written" : "❌ Missing (recommended)" },
                      { label: "Photo", value: avatarPreview ? "✅ Uploaded" : "❌ Missing (required)" },
                      { label: "Socials", value: [twitter && "𝕏", linkedin && "in", instagram && "IG", website && "WEB"].filter(Boolean).join(" ") || "None" },
                    ].map((item) => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                        <span style={{ fontWeight: 800, fontSize: "0.8rem", textTransform: "uppercase" }}>{item.label}</span>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: "60%", textAlign: "right" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* What happens */}
                  <div style={{ padding: 20, border: "2px solid var(--border-light)", fontSize: "0.8rem", lineHeight: 1.7, color: "var(--text-muted)", marginBottom: 28 }}>
                    <strong style={{ color: "var(--text)" }}>What happens when you launch:</strong>
                    <ul style={{ marginTop: 8, paddingLeft: 16 }}>
                      <li>A <strong>Token-2022 mint</strong> is created on Solana (with metadata &amp; freeze)</li>
                      <li>A <strong>Human Curve™ bonding curve</strong> is activated — anyone can buy/sell</li>
                      <li><strong>${TOKEN_SEED_USD}</strong> injected as initial liquidity — your token starts with real value</li>
                      <li>You get <strong>Founder tokens</strong> at the initial price (locked 1 year) + earn <strong>up to 3% fees</strong> in SOL on every trade</li>
                      <li>Your profile goes <strong>live on the marketplace</strong></li>
                      <li>You can start posting in your <strong>Inner Circle</strong> (token-gated feed)</li>
                    </ul>
                  </div>

                  {/* ── Fixed Creation Fee Display ── */}
                  <div style={{
                    padding: 24,
                    border: "3px solid var(--accent)",
                    background: "#fff",
                    marginBottom: 28,
                    boxShadow: "6px 6px 0px rgba(0,0,0,0.08)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <span style={{ fontWeight: 800, fontSize: "1.2rem" }}>◇</span>
                      <span style={{ fontWeight: 800, fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>Token Creation Fee</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
                      <span style={{ fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.02em" }}>${CREATION_FEE_USD}</span>
                      {solPriceUsd > 0 && (
                        <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-muted)" }}>
                          ≈ {(CREATION_FEE_USD / solPriceUsd).toFixed(4)} SOL
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
                      Includes initial liquidity for your bonding curve and Solana network costs.<br />
                      <strong>Everyone starts with the same base.</strong> One fixed price, one fair start.
                    </div>
                  </div>

                  <button
                    className="btn-solid"
                    disabled={!avatarPreview || !tokenName || !tokenSymbol || !category || bio.length < 20}
                    style={{
                      width: "100%",
                      background: "var(--accent)",
                      padding: "16px",
                      fontSize: "1rem",
                      opacity: !avatarPreview || !tokenName || !tokenSymbol || !category || bio.length < 20 ? 0.5 : 1,
                      cursor: !avatarPreview || !tokenName || !tokenSymbol || !category || bio.length < 20 ? "not-allowed" : "pointer",
                    }}
                    onClick={handleLaunch}
                  >
                    Launch My Token — ${CREATION_FEE_USD}
                  </button>
                </div>
              )}

              {/* Navigation */}
              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                {currentSection > 0 && (
                  <button
                    className="btn-solid"
                    style={{ background: "#fff", color: "var(--text)", border: "2px solid var(--border)", flex: 1 }}
                    onClick={() => setCurrentSection(currentSection - 1)}
                  >
                    ← Back
                  </button>
                )}
                {currentSection < sections.length - 1 && (
                  <button
                    className="btn-solid"
                    style={{
                      background: canProceed() ? "var(--accent)" : "#ccc",
                      flex: 1,
                      cursor: canProceed() ? "pointer" : "not-allowed",
                    }}
                    onClick={() => {
                      if (canProceed()) setCurrentSection(currentSection + 1);
                    }}
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>

            {/* Right: Live Preview Card (memoized for performance) */}
            <LivePreviewCard
              name={deferredName}
              symbol={deferredSymbol}
              bio={deferredBio}
              category={deferredCategory}
              categoryLabel={deferredCategoryLabel}
              country={deferredCountry}
              countryName={deferredCountryName}
              avatar={deferredAvatar}
              twitter={twitter}
              linkedin={linkedin}
              instagram={instagram}
              website={website}
            />
          </div>
        )}

        {/* ── STEP: LAUNCHING ── */}
        {step === "launching" && (
          <div style={{ maxWidth: 640, textAlign: "center", padding: "80px 0", margin: "0 auto" }}>
            <div style={{ fontSize: "2.4rem", marginBottom: 16, animation: "pulse 1.5s infinite" }}>◈</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 12 }}>
              {launchStep === 1 && "Uploading your photo & metadata..."}
              {launchStep === 2 && "Creating your token on Solana..."}
              {launchStep === 3 && "Registering your profile..."}
              {launchStep >= 4 && "Almost there..."}
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 32 }}>
              This may take 10-30 seconds. Do not close this page.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 380, margin: "0 auto", textAlign: "left" }}>
              {[
                { step: 1, label: "Upload photo to Supabase Storage" },
                { step: 2, label: "Create Token-2022 mint on Solana" },
                { step: 2, label: "Mint 100M tokens to vault (locked)" },
                { step: 2, label: "Activate bonding curve market" },
                { step: 3, label: "Register profile on marketplace" },
              ].map((s, i) => {
                const isDone = launchStep > s.step;
                const isActive = launchStep === s.step;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, fontSize: "0.85rem" }}>
                    <div style={{
                      width: 24,
                      height: 24,
                      border: `2px solid ${isDone ? "#22c55e" : isActive ? "var(--accent)" : "var(--border)"}`,
                      background: isDone ? "#22c55e" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.65rem",
                      color: isDone ? "#fff" : "var(--text-muted)",
                      fontWeight: 800,
                      flexShrink: 0,
                      transition: "all 0.3s",
                      ...(isActive ? { animation: "pulse 1.5s infinite" } : {}),
                    }}>
                      {isDone ? "✓" : isActive ? "◈" : ""}
                    </div>
                    <span style={{
                      color: isDone ? "var(--text)" : isActive ? "var(--text)" : "var(--text-muted)",
                      fontWeight: isDone || isActive ? 700 : 400,
                      transition: "all 0.3s",
                    }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP: DONE ── */}
        {step === "done" && (
          <div style={{ maxWidth: 640, textAlign: "center", padding: "80px 0", margin: "0 auto" }}>
            <div style={{ fontSize: "2.4rem", marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 12 }}>
              Token Created Successfully!
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}>
              <strong>${tokenSymbol}</strong> is now live on Solana. Your bonding curve is active
              and people can start investing in you. Post in your Inner Circle to engage your holders.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <a href="/explore" className="btn-solid" style={{ background: "var(--accent)" }}>Explore Marketplace</a>
              <a href="/" className="btn-solid" style={{ background: "#fff", color: "var(--text)", border: "2px solid var(--border)" }}>Go to Feed</a>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
