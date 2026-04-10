"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";
import { usePrivy } from "@privy-io/react-auth";
import { useHumanofi } from "@/hooks/useHumanofi";
import { PublicKey } from "@solana/web3.js";
import { toast } from "sonner";

const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY_WALLET || "11111111111111111111111111111111"
);

const DEFAULT_BASE_PRICE = 10_000;
const DEFAULT_SLOPE = 1_000;

// ── Expanded categories ──
const CATEGORIES = [
  { value: "founder", label: "Founder", emoji: "🚀" },
  { value: "creator", label: "Creator", emoji: "🎨" },
  { value: "developer", label: "Developer", emoji: "💻" },
  { value: "trader", label: "Trader", emoji: "📊" },
  { value: "artist", label: "Artist", emoji: "🎭" },
  { value: "musician", label: "Musician", emoji: "🎵" },
  { value: "athlete", label: "Athlete", emoji: "⚡" },
  { value: "influencer", label: "Influencer", emoji: "📱" },
  { value: "researcher", label: "Researcher", emoji: "🔬" },
  { value: "thinker", label: "Thinker", emoji: "💡" },
  { value: "investor", label: "Investor", emoji: "💰" },
  { value: "designer", label: "Designer", emoji: "✏️" },
  { value: "writer", label: "Writer", emoji: "📝" },
  { value: "filmmaker", label: "Filmmaker", emoji: "🎬" },
  { value: "photographer", label: "Photographer", emoji: "📸" },
  { value: "educator", label: "Educator", emoji: "📚" },
  { value: "activist", label: "Activist", emoji: "✊" },
  { value: "chef", label: "Chef", emoji: "👨‍🍳" },
  { value: "streamer", label: "Streamer", emoji: "🎮" },
  { value: "engineer", label: "Engineer", emoji: "⚙️" },
  { value: "scientist", label: "Scientist", emoji: "🧬" },
  { value: "journalist", label: "Journalist", emoji: "📰" },
  { value: "other", label: "Other", emoji: "◈" },
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
  const [step, setStep] = useState<"connect" | "form" | "launching" | "done">("connect");
  const [currentSection, setCurrentSection] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Privy auth
  const { authenticated, login, user } = usePrivy();
  const walletAddress = (user as { wallet?: { address?: string } } | null)?.wallet?.address || null;

  // Memoize wallet object to prevent re-renders
  const walletObj = useMemo(() => {
    if (!walletAddress) return null;
    try {
      return { publicKey: new PublicKey(walletAddress) };
    } catch {
      return null;
    }
  }, [walletAddress]);

  // Auto-switch to form when authenticated (in useEffect, not during render!)
  useEffect(() => {
    if (authenticated && step === "connect") {
      setStep("form");
    }
  }, [authenticated, step]);

  const { createToken } = useHumanofi(walletObj);
  const [launchStep, setLaunchStep] = useState(0); // 0=idle, 1=uploading, 2=creating, 3=registering, 4=done

  // Handle avatar upload
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

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

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

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarBase64: avatarPreview,
          tokenName,
          tokenSymbol: tokenSymbol.toUpperCase(),
          category,
          bio,
          story,
          offer,
          country,
          walletAddress: walletObj?.publicKey?.toBase58(),
          socials: {
            ...(twitter && { twitter }),
            ...(linkedin && { linkedin }),
            ...(website && { website }),
            ...(instagram && { instagram }),
          },
        }),
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

      const result = await createToken({
        name: tokenName,
        symbol: tokenSymbol.toUpperCase(),
        basePrice: DEFAULT_BASE_PRICE,
        slope: DEFAULT_SLOPE,
        treasury: TREASURY,
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
            walletAddress: walletObj?.publicKey?.toBase58(),
            hiuid: "pending", // Will be set after KYC
            displayName: tokenName,
            category,
            bio,
            avatarUrl,         // ← Real Supabase Storage URL
            metadataUrl,       // ← Metaplex-standard JSON URL
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

      setLaunchStep(4);
      setStep("done");
      toast.success(`Token $${tokenSymbol.toUpperCase()} created!`);
    } catch {
      setStep("form");
      setLaunchStep(0);
    }
  }, [tokenName, tokenSymbol, category, bio, avatarPreview, avatarFile, story, offer, country, twitter, linkedin, website, instagram, createToken, walletObj]);

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
        <div className="page__header" style={{ display: "block" }}>
          <h1 className="page__title">Create your token</h1>
          <p className="page__subtitle">
            One token per human. Verified. Permanent. Impossible to duplicate.
          </p>
        </div>

        {/* ── STEP: CONNECT ── */}
        {step === "connect" && (
          <div style={{ maxWidth: 680 }}>
            <div className="trade-widget" style={{ marginBottom: 32, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: "2.4rem", marginBottom: 16 }}>◈</div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 12 }}>
                Start by connecting your wallet
              </h2>
              <p style={{ color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}>
                Creating your token requires biometric identity verification (KYC)
                and a deployment transaction on Solana. Total cost: ~$10 in SOL.
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
          <div style={{ maxWidth: 780, display: "grid", gridTemplateColumns: "1fr 280px", gap: 32, alignItems: "start" }}>

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
                          <div style={{ fontSize: "2rem", marginBottom: 4 }}>📸</div>
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
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          onClick={() => setCategory(cat.value)}
                          style={{
                            padding: "10px 8px",
                            border: category === cat.value ? "2px solid var(--accent)" : "2px solid var(--border)",
                            background: category === cat.value ? "var(--accent)" : "#fff",
                            color: category === cat.value ? "#fff" : "var(--text)",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span>{cat.emoji}</span>
                          <span>{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Country */}
                  <div style={sectionStyle}>
                    <label style={labelStyle}>Country</label>
                    <select
                      style={{ ...inputStyle, cursor: "pointer" }}
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    >
                      <option value="">Select your country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
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
                    { label: "Instagram", value: instagram, set: setInstagram, placeholder: "@yourhandle", icon: "📷" },
                    { label: "Website", value: website, set: setWebsite, placeholder: "https://yourwebsite.com", icon: "🌐" },
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
                      { label: "Socials", value: [twitter && "𝕏", linkedin && "in", instagram && "📷", website && "🌐"].filter(Boolean).join(" ") || "None" },
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
                      <li>A <strong>Token-2022 mint</strong> is created on Solana</li>
                      <li><strong>100M tokens</strong> are minted to your vault (locked 1 year)</li>
                      <li>A <strong>bonding curve</strong> market is activated — anyone can buy/sell</li>
                      <li>Your profile goes <strong>live on the marketplace</strong></li>
                      <li>You can start posting in your <strong>Inner Circle</strong> (token-gated feed)</li>
                    </ul>
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
                    🚀 Launch My Token (~$10 in SOL)
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

            {/* Right: Live Preview Card */}
            <div style={{ position: "sticky", top: 100 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, color: "var(--text-muted)" }}>
                Live Preview
              </div>
              <div style={{
                border: "2px solid var(--border)",
                background: "#fff",
                overflow: "hidden",
              }}>
                {/* Photo */}
                <div style={{
                  width: "100%",
                  height: 220,
                  background: avatarPreview ? `url(${avatarPreview}) center/cover` : "linear-gradient(135deg, #f0f0f0, #e0e0e0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {!avatarPreview && (
                    <div style={{ fontSize: "3rem", opacity: 0.3 }}>◈</div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: 20 }}>
                  {category && (
                    <div style={{
                      display: "inline-block",
                      padding: "3px 10px",
                      border: "2px solid var(--border)",
                      fontSize: "0.65rem",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      marginBottom: 12,
                    }}>
                      {CATEGORIES.find((c) => c.value === category)?.emoji} {category}
                    </div>
                  )}

                  <div style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: 4 }}>
                    {tokenName || "Your Name"}
                  </div>

                  {tokenSymbol && (
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)", marginBottom: 12 }}>
                      ${tokenSymbol}
                    </div>
                  )}

                  <div style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}>
                    {bio || "Your bio will appear here..."}
                  </div>

                  {/* Socials preview */}
                  {(twitter || linkedin || instagram || website) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      {twitter && <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#f0f0f0", padding: "2px 8px" }}>𝕏</span>}
                      {linkedin && <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#f0f0f0", padding: "2px 8px" }}>in</span>}
                      {instagram && <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#f0f0f0", padding: "2px 8px" }}>📷</span>}
                      {website && <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "#f0f0f0", padding: "2px 8px" }}>🌐</span>}
                    </div>
                  )}

                  {country && (
                    <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 8 }}>
                      📍 {COUNTRIES.find((c) => c.code === country)?.name}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: LAUNCHING ── */}
        {step === "launching" && (
          <div style={{ maxWidth: 640, textAlign: "center", padding: "80px 0" }}>
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
          <div style={{ maxWidth: 640, textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: "2.4rem", marginBottom: 16 }}>✓</div>
            <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: 12 }}>
              Token Created Successfully!
            </h2>
            <p style={{ color: "var(--text-muted)", marginBottom: 32, lineHeight: 1.6 }}>
              <strong>${tokenSymbol}</strong> is now live on Solana. Your bonding curve is active
              and people can start investing in you. Post in your Inner Circle to engage your holders.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <a href="/" className="btn-solid" style={{ background: "var(--accent)" }}>View Marketplace</a>
              <a href="/leaderboard" className="btn-solid" style={{ background: "#fff", color: "var(--text)", border: "2px solid var(--border)" }}>Leaderboard</a>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
