/**
 * Audit on-chain du CreatorFeeVault pour un mint spécifique
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("4u14FtDEdr1UqSXbwhDXDLi552Skm1TPodrtjKje2pmQ");
const MINT = new PublicKey("8hUpGwUzxvppTtuiwqycuwzBWiAdw9eTUtFaRMNRd6bs");
const RPC = "https://api.devnet.solana.com";

function derivePDA(seed: string, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(seed), mint.toBuffer()],
    PROGRAM_ID
  );
}

async function main() {
  const conn = new Connection(RPC, "confirmed");

  console.log("═══════════════════════════════════════════════");
  console.log("  AUDIT CREATOR FEE VAULT");
  console.log(`  Mint: ${MINT.toBase58()}`);
  console.log("═══════════════════════════════════════════════\n");

  // 1. Derive all PDAs
  const [curvePDA] = derivePDA("curve", MINT);
  const [feeVaultPDA] = derivePDA("creator_fees", MINT);
  const [vaultPDA] = derivePDA("vault", MINT);

  console.log("── PDAs ──");
  console.log(`  BondingCurve:     ${curvePDA.toBase58()}`);
  console.log(`  CreatorFeeVault:  ${feeVaultPDA.toBase58()}`);
  console.log(`  CreatorVault:     ${vaultPDA.toBase58()}\n`);

  // 2. Read CreatorFeeVault
  const feeVaultInfo = await conn.getAccountInfo(feeVaultPDA);
  if (!feeVaultInfo) {
    console.log("❌ CreatorFeeVault NOT found on-chain");
    return;
  }

  const fvData = feeVaultInfo.data;
  console.log("── CreatorFeeVault Account ──");
  console.log(`  Data length: ${fvData.length} bytes`);
  console.log(`  Lamports (rent): ${feeVaultInfo.lamports} (${feeVaultInfo.lamports / LAMPORTS_PER_SOL} SOL)`);

  // Parse: 8 disc + 32 mint + 32 creator + 8 total_accumulated + 8 total_claimed + 8 last_claim_at + 8 created_at + 1 bump
  const vaultMint = new PublicKey(fvData.subarray(8, 40));
  const vaultCreator = new PublicKey(fvData.subarray(40, 72));
  const totalAccumulated = fvData.readBigUInt64LE(72);
  const totalClaimed = fvData.readBigUInt64LE(80);
  const lastClaimAt = fvData.readBigInt64LE(88);
  const createdAt = fvData.readBigInt64LE(96);
  const bump = fvData[104];

  console.log(`  Mint:              ${vaultMint.toBase58()}`);
  console.log(`  Creator:           ${vaultCreator.toBase58()}`);
  console.log(`  Total Accumulated: ${totalAccumulated} lamports (${Number(totalAccumulated) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Total Claimed:     ${totalClaimed} lamports (${Number(totalClaimed) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Unclaimed:         ${Number(totalAccumulated) - Number(totalClaimed)} lamports (${(Number(totalAccumulated) - Number(totalClaimed)) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Last Claim At:     ${lastClaimAt === 0n ? "never" : new Date(Number(lastClaimAt) * 1000).toISOString()}`);
  console.log(`  Created At:        ${new Date(Number(createdAt) * 1000).toISOString()}`);
  console.log(`  Bump:              ${bump}`);

  // Check actual lamport balance vs what the vault thinks it has
  const actualLamports = BigInt(feeVaultInfo.lamports);
  const rent = BigInt(await conn.getMinimumBalanceForRentExemption(fvData.length));
  const actualUsable = actualLamports - rent;
  console.log(`\n  Actual lamports in PDA:  ${actualLamports} (${Number(actualLamports) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Rent exempt minimum:    ${rent} (${Number(rent) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  Actual usable:          ${actualUsable} (${Number(actualUsable) / LAMPORTS_PER_SOL} SOL)`);

  // 3. Read BondingCurve
  const curveInfo = await conn.getAccountInfo(curvePDA);
  if (!curveInfo) {
    console.log("\n❌ BondingCurve NOT found");
    return;
  }

  const cData = curveInfo.data;
  console.log("\n── BondingCurve Account ──");
  console.log(`  Data length: ${cData.length} bytes`);
  console.log(`  Lamports: ${curveInfo.lamports} (${curveInfo.lamports / LAMPORTS_PER_SOL} SOL)`);

  // Parse curve: 8 disc + 32 mint + 32 creator + 16 x + 16 y + 16 k + ...
  const curveMint = new PublicKey(cData.subarray(8, 40));
  const curveCreator = new PublicKey(cData.subarray(40, 72));

  // x is u128 at offset 72
  const xLow = cData.readBigUInt64LE(72);
  const xHigh = cData.readBigUInt64LE(80);
  const x = xLow + (xHigh << 64n);

  // y is u128 at offset 88
  const yLow = cData.readBigUInt64LE(88);
  const yHigh = cData.readBigUInt64LE(96);
  const y = yLow + (yHigh << 64n);

  // k is u128 at offset 104
  const kLow = cData.readBigUInt64LE(104);
  const kHigh = cData.readBigUInt64LE(112);
  const k = kLow + (kHigh << 64n);

  // supply_public u64 at offset 120
  const supplyPublic = cData.readBigUInt64LE(120);
  const supplyCreator = cData.readBigUInt64LE(128);
  const supplyProtocol = cData.readBigUInt64LE(136);
  const solReserve = cData.readBigUInt64LE(144);
  const depthParameter = cData.readBigUInt64LE(152);

  console.log(`  Mint:            ${curveMint.toBase58()}`);
  console.log(`  Creator:         ${curveCreator.toBase58()}`);
  console.log(`  x (total):       ${x} (${Number(x) / LAMPORTS_PER_SOL} SOL-equiv)`);
  console.log(`  y (tokens):      ${y} (${Number(y) / 1e6} tokens)`);
  console.log(`  k (invariant):   ${k}`);
  console.log(`  sol_reserve:     ${solReserve} (${Number(solReserve) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  depth_parameter: ${depthParameter} (${Number(depthParameter) / LAMPORTS_PER_SOL} SOL)`);
  console.log(`  supply_public:   ${supplyPublic} (${Number(supplyPublic) / 1e6} tokens)`);
  console.log(`  supply_creator:  ${supplyCreator} (${Number(supplyCreator) / 1e6} tokens)`);
  console.log(`  supply_protocol: ${supplyProtocol} (${Number(supplyProtocol) / 1e6} tokens)`);

  const pricePerToken = Number(x) * 1e6 / Number(y) / LAMPORTS_PER_SOL;
  console.log(`  Spot price:      ${pricePerToken.toFixed(8)} SOL/token`);

  // 4. Get recent transactions for the fee vault PDA
  console.log("\n── Transaction History (Fee Vault PDA) ──");
  const sigs = await conn.getSignaturesForAddress(feeVaultPDA, { limit: 20 });
  console.log(`  Found ${sigs.length} transactions`);

  for (const sig of sigs.reverse()) {
    const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    if (!tx || !tx.meta) continue;

    const preBalances = tx.meta.preBalances;
    const postBalances = tx.meta.postBalances;
    const keys = tx.transaction.message.getAccountKeys();

    // Find the fee vault index in the accounts
    let feeVaultIdx = -1;
    for (let i = 0; i < keys.length; i++) {
      if (keys.get(i)?.toBase58() === feeVaultPDA.toBase58()) {
        feeVaultIdx = i;
        break;
      }
    }

    if (feeVaultIdx >= 0) {
      const pre = preBalances[feeVaultIdx];
      const post = postBalances[feeVaultIdx];
      const delta = post - pre;
      const deltaSOL = delta / LAMPORTS_PER_SOL;
      const time = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : "unknown";

      console.log(`\n  TX: ${sig.signature.slice(0, 20)}...`);
      console.log(`    Time:    ${time}`);
      console.log(`    Delta:   ${delta >= 0 ? "+" : ""}${delta} lamports (${deltaSOL >= 0 ? "+" : ""}${deltaSOL.toFixed(6)} SOL)`);

      // Also check the BondingCurve PDA sol flow
      let curveIdx = -1;
      for (let i = 0; i < keys.length; i++) {
        if (keys.get(i)?.toBase58() === curvePDA.toBase58()) {
          curveIdx = i;
          break;
        }
      }
      if (curveIdx >= 0) {
        const curvePre = preBalances[curveIdx];
        const curvePost = postBalances[curveIdx];
        const curveDelta = curvePost - curvePre;
        console.log(`    Curve Δ: ${curveDelta >= 0 ? "+" : ""}${curveDelta} lamports (${(curveDelta / LAMPORTS_PER_SOL).toFixed(6)} SOL)`);
      }

      // Check signer (buyer/seller)
      const signer = keys.get(0);
      console.log(`    Signer:  ${signer?.toBase58().slice(0, 12)}...`);

      // Log instruction type
      if (tx.meta.logMessages) {
        for (const log of tx.meta.logMessages) {
          if (log.includes("✅") || log.includes("Buy") || log.includes("Sell") || log.includes("Claim") || log.includes("Token created")) {
            console.log(`    Log:     ${log}`);
          }
        }
      }
    }
  }

  // 5. Calculate expected fees
  console.log("\n\n═══════════════════════════════════════════════");
  console.log("  FEE ANALYSIS");
  console.log("═══════════════════════════════════════════════\n");

  const accumulatedSol = Number(totalAccumulated) / LAMPORTS_PER_SOL;
  console.log(`  Total accumulated in vault state: ${accumulatedSol} SOL`);
  console.log(`  Actual usable lamports in PDA:    ${Number(actualUsable) / LAMPORTS_PER_SOL} SOL`);
  console.log(`  Difference (state vs reality):    ${(accumulatedSol - Number(actualUsable) / LAMPORTS_PER_SOL).toFixed(9)} SOL`);

  // If user did 1 SOL buy + 3.4 SOL buy + sell 50% tokens
  // Expected 3% fees:
  // Buy 1: 1 * 0.03 = 0.03 SOL
  // Buy 2: 3.4 * 0.03 = 0.102 SOL
  // Sell: need to know the gross SOL from sell
  console.log(`\n  ── Expected vs Actual ──`);
  console.log(`  If 3% of volume → fee should be ~3% of total SOL transacted`);
  console.log(`  If 6% of volume → fee would be ~6% of total SOL transacted`);
  
  // Reverse calculate: what % of total volume does the accumulated fee represent?
  // We need transaction history to determine total volume
}

main().catch(console.error);
