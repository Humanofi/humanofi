// ========================================
// Humanofi — The "Infinite Aura" Engine
// ========================================
// A massive upgrade over basic identicons.
// Produces "Avant-Garde / Brutalist" abstract human portraits.
// - 100% Deterministic (same wallet = same avatar)
// - Infinite colors (Procedural HSL generation)
// - 7 distinct archetypes (Silhouettes)
// - Happy & Confident expressions ONLY
// - Cyberpunk / Web3 HUD overlays (barcode, ID)

/**
 * Seeded PRNG based on Mulberry32 and FNV-1a hash.
 */
function getPRNG(str: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  let a = hash;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate an "Infinite Aura" SVG data URI from a wallet address.
 */
export function generateIdenticon(walletAddress: string): string {
  if (!walletAddress) return "";
  
  const rand = getPRNG(walletAddress);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const uid = walletAddress.slice(0, 6) + Math.floor(rand() * 1000);

  // ── 1. Infinite Palettes (Humanofi DA) ──
  // Backgrounds: Pitch black, dark zinc, white, off-white
  const bgs = ["#000000", "#09090b", "#18181b", "#ffffff", "#fafafa", "#f4f4f5"];
  const bg = pick(bgs);
  const isDarkBg = ["#000000", "#09090b", "#18181b"].includes(bg);
  
  // Face color alternates contrast with bg
  const faceColors = isDarkBg ? ["#ffffff", "#e4e4e7", "#a1a1aa", "#27272a"] : ["#000000", "#27272a", "#52525b", "#d4d4d8"];
  const face = pick(faceColors);

  // Accent color is incredibly vibrant / neon and completely dynamic (Hue 0-360)
  const H1 = Math.floor(rand() * 360);
  const accent = `hsl(${H1}, 90%, 55%)`; // Main neon color
  
  // Detail color (Opposite hue or secondary high contrast)
  const H2 = (H1 + 180 + (rand() * 60 - 30)) % 360; 
  const detail = `hsl(${H2}, 80%, 65%)`;

  // ── 2. Silhouette Archetypes ──
  // We vary the core structure radically to ensure 0 resemblance between avatars
  const shapeType = Math.floor(rand() * 7);
  let faceHtml = "";
  if (shapeType === 0) {
    faceHtml = `<rect x="25" y="15" width="50" height="70" rx="25" fill="${face}"/>`; // Pill
  } else if (shapeType === 1) {
    faceHtml = `<polygon points="50,10 85,30 85,70 50,90 15,70 15,30" fill="${face}"/>`; // Hexagon
  } else if (shapeType === 2) {
    faceHtml = `<path d="M25,20 h25 v60 h-25 z" fill="${face}"/><path d="M50,20 h25 v60 h-25 z" fill="${accent}"/>`; // Vertical Two-Face Split
  } else if (shapeType === 3) {
    faceHtml = `<polygon points="35,15 65,15 65,35 85,35 85,65 65,65 65,85 35,85 35,65 15,65 15,35 35,35" fill="${face}"/>`; // Cyber-cross
  } else if (shapeType === 4) {
    faceHtml = `<rect x="25" y="20" width="50" height="25" fill="${face}"/><rect x="35" y="50" width="30" height="30" fill="${detail}"/>`; // Deconstructed blocks
  } else if (shapeType === 5) {
    faceHtml = `<polygon points="15,20 85,20 50,80" fill="${face}"/>`; // Inverted Triangle
  } else {
    faceHtml = `<rect x="20" y="25" width="50" height="50" fill="${accent}" opacity="0.6"/><rect x="30" y="20" width="50" height="50" fill="${face}"/>`; // Glitch offset
  }

  // ── 3. Happy & Confident Mouths ──
  // Y around 68-75 depending on shape
  const mouthY = 70;
  const mouths = [
    (c: string) => `<path d="M35,${mouthY-2} Q50,${mouthY+12} 65,${mouthY-2}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`, // Big Smile
    (c: string) => `<path d="M35,${mouthY} Q55,${mouthY+15} 75,${mouthY-5}" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`, // Smirk
    (c: string) => `<circle cx="50" cy="${mouthY}" r="8" fill="${c}"/>`, // Singing / Ooh
    (c: string) => `<rect x="40" y="${mouthY-2}" width="20" height="6" rx="3" fill="${c}"/>`, // Confident neutral bar
    (c: string) => `<polygon points="40,${mouthY-2} 60,${mouthY-2} 50,${mouthY+6}" fill="${c}"/>`, // Triangle smile
    (c: string) => `<line x1="42" y1="${mouthY}" x2="58" y2="${mouthY}" stroke="${c}" stroke-width="4" stroke-linecap="square"/>` // Subtle confident
  ];
  // Calculate contrasting mouth color
  let mouthColor = accent;
  if (rand() > 0.5) {
    mouthColor = (isDarkBg && face === "#000000") ? "#ffffff" : (!isDarkBg && face === "#ffffff" ? "#000000" : "#ffffff");
  }
  const mouthHtml = pick(mouths)(mouthColor);

  // ── 4. Infinite Eyes ──
  const eyesRenderers = [
    (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y}" r="${4 + rand()*4}" fill="${c}"/>`, // Core dot
    (x: number, y: number, c: string) => `<path d="M${x-6},${y} Q${x},${y-8} ${x+6},${y}" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`, // Happy curved (arc up)
    (x: number, y: number, c: string) => `<rect x="${x-5}" y="${y-5}" width="10" height="10" rx="${rand()*5}" fill="${c}"/>`, // Rounded rect
    (x: number, y: number, c: string) => `<line x1="${x-6}" y1="${y}" x2="${x+6}" y2="${y}" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`, // Chill line
    (x: number, y: number, c: string) => `<polygon points="${x},${y-6} ${x+6},${y} ${x},${y+6} ${x-6},${y}" fill="${c}"/>`, // Diamond
    (x: number, y: number, c: string) => `<circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${c}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`, // Target
    (x: number, y: number, c: string) => `<text x="${x}" y="${y+4}" font-family="monospace" font-size="12" fill="${c}" font-weight="bold" text-anchor="middle">X</text>` // X
  ];

  let eyesHtml = "";
  const eyeLayout = Math.floor(rand() * 4); // 4 eye layouts
  const eyeColor = rand() < 0.5 ? accent : detail;
  
  if (eyeLayout === 0) {
    // Cyclops! (1 central geometric eye)
    eyesHtml = pick(eyesRenderers)(50, 42, eyeColor).replace(/r="\d+"/, `r="14"`);
  } else {
    // Two eyes
    const lEyeX = 35 + rand() * 4;
    const rEyeX = 65 - rand() * 4;
    const eyeY = 42 + rand() * 4 - 2;
    
    // 60% chance symmetric, 40% chance completely mismatched!
    const lRender = pick(eyesRenderers);
    const rRender = rand() < 0.6 ? lRender : pick(eyesRenderers);
    
    eyesHtml = lRender(lEyeX, eyeY, eyeColor) + rRender(rEyeX, eyeY, rand() < 0.5 ? eyeColor : accent);
  }

  // ── 5. Accessories & Auras ──
  const auras = [
    `<circle cx="50" cy="50" r="46" fill="none" stroke="${detail}" stroke-width="1.5" stroke-dasharray="2 4"/>`, // Dash orbit
    `<circle cx="50" cy="50" r="45" fill="${accent}" opacity="0.12"/>`, // Glow
    `<path d="M0,0 L100,100 M100,0 L0,100" stroke="${accent}" stroke-width="0.5" opacity="0.4"/>`, // Crossing rays
    `<rect x="10" y="10" width="80" height="80" fill="none" stroke="${detail}" stroke-width="2" opacity="0.2"/>`, // Frame
    ``, `` // Empty space
  ];
  const auraHtml = pick(auras);

  const accessories = [
    `<rect x="15" y="38" width="70" height="12" fill="${accent}" opacity="0.8"/>`, // Cyberpunk Visor
    `<circle cx="80" cy="20" r="${4+rand()*6}" fill="${accent}" opacity="0.9"/>`, // Floating orb right
    `<path d="M30,10 L70,10" stroke="${detail}" stroke-width="4" stroke-linecap="round"/>`, // Halo bar
    `<line x1="5" y1="50" x2="95" y2="50" stroke="${accent}" stroke-width="2" stroke-dasharray="10 5"/>`, // Mid glitch line
    ``, `` 
  ];
  const accHtml = pick(accessories);

  // ── 6. UI / HUD Overlays ──
  // High-tech aesthetic data overlays
  const isVerified = rand() < 0.3;
  const overlayColor = isDarkBg ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  
  const overlayHtml = `
    <g opacity="0.6">
      <!-- Wallet tag top left -->
      <text x="4" y="8" font-family="monospace" font-size="5" fill="${overlayColor}">ID:${uid}</text>
      <!-- Verified dot -->
      ${isVerified ? `<circle cx="94" cy="6" r="2.5" fill="${accent}"/>` : ''}
      <!-- Barcode lines bottom right -->
      <rect x="80" y="90" width="2" height="6" fill="${overlayColor}"/>
      <rect x="84" y="88" width="2" height="8" fill="${overlayColor}"/>
      <rect x="88" y="92" width="2" height="4" fill="${overlayColor}"/>
      <rect x="92" y="87" width="2" height="9" fill="${overlayColor}"/>
    </g>
  `;

  // Build SVG
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="${bg}"/>
      ${auraHtml}
      ${faceHtml}
      ${eyesHtml}
      ${mouthHtml}
      ${accHtml}
      ${overlayHtml}
    </svg>
  `.replace(/\n/g, '').replace(/\s{2,}/g, ' ');

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Get the avatar URL for a wallet: use stored URL if available, otherwise generate aura.
 */
export function getAvatarUrl(walletAddress: string, storedUrl?: string | null): string {
  if (storedUrl && storedUrl.length > 0) return storedUrl;
  return generateIdenticon(walletAddress);
}

/**
 * Generate a default display name from a wallet address.
 */
export function getDefaultDisplayName(walletAddress: string): string {
  return `Anon_${walletAddress.slice(0, 4)}`;
}
