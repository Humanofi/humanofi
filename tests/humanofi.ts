// ========================================
// Humanofi — Integration Tests (v3.6 — Human Curve™)
// ========================================
//
// Tests the full lifecycle:
// 1. Create a personal token (Human Curve™ + Founder Buy)
// 2. Buy tokens from the bonding curve (100% to buyer)
// 3. Sell tokens back (with k-deepening)
// 4. Token confinement (frozen accounts)
// 5. Creator sell restriction (Year 1 lock)
// 6. Fee distribution verification (5% = 2+2+1)
// 7. Slippage protection
//
// Run: anchor test

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect } from "chai";

// Import the generated types
import { Humanofi } from "../target/types/humanofi";

describe("humanofi v3.6", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Humanofi as Program<Humanofi>;

  // ---- Test Accounts ----
  const creator = Keypair.generate();
  const buyer = Keypair.generate();
  const mint = Keypair.generate();

  // ---- Treasury (hardcoded in constants.rs) ----
  // Must match TREASURY_WALLET in constants.rs
  // For local tests, we derive this from the constant bytes.
  // In devnet/mainnet, use the actual address.
  const TREASURY = new PublicKey("6Jiop19yLzazX6vig4i4jKMRXRjFJumTWBZNgU2cAodM");

  // ---- PDAs ----
  let bondingCurvePda: PublicKey;
  let creatorVaultPda: PublicKey;
  let creatorFeeVaultPda: PublicKey;
  let protocolVaultPda: PublicKey;
  let purchaseLimiterPda: PublicKey;

  // ---- Token Accounts ----
  let creatorAta: PublicKey;
  let buyerAta: PublicKey;

  // ---- Constants ----
  const INITIAL_LIQUIDITY = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL

  before(async () => {
    // Airdrop SOL to creator, buyer, and treasury
    for (const kp of [creator, buyer]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        100 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Fund treasury (needed for constraint check)
    const treasurySig = await provider.connection.requestAirdrop(
      TREASURY,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(treasurySig);

    // Derive PDAs
    [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("curve"), mint.publicKey.toBuffer()],
      program.programId
    );

    [creatorVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), mint.publicKey.toBuffer()],
      program.programId
    );

    [creatorFeeVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("creator_fees"), mint.publicKey.toBuffer()],
      program.programId
    );

    [protocolVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_vault"), mint.publicKey.toBuffer()],
      program.programId
    );

    [purchaseLimiterPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("limiter"),
        buyer.publicKey.toBuffer(),
        mint.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Derive ATAs (Token-2022)
    creatorAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      creator.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    buyerAta = getAssociatedTokenAddressSync(
      mint.publicKey,
      buyer.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
  });

  // =============================================
  // TEST 1: Create Token (Human Curve™ + Founder Buy)
  // =============================================
  it("✅ Creates a personal token with Founder Buy", async () => {
    const tx = await program.methods
      .createToken("Alice", "ALICE", "https://example.com/metadata.json", INITIAL_LIQUIDITY)
      .accountsStrict({
        creator: creator.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        creatorVault: creatorVaultPda,
        creatorFeeVault: creatorFeeVaultPda,
        protocolVault: protocolVaultPda,
        creatorTokenAccount: creatorAta,
        treasury: TREASURY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator, mint])
      .rpc();

    console.log("    → TX:", tx);

    // Verify BondingCurve PDA
    const curve = await program.account.bondingCurve.fetch(bondingCurvePda) as any;
    expect(curve.mint.toString()).to.equal(mint.publicKey.toString());
    expect(curve.creator.toString()).to.equal(creator.publicKey.toString());

    // After Founder Buy: x > D = 20 × V = 20 × 0.1 SOL = 2.0 SOL
    const D = 20 * 0.1 * LAMPORTS_PER_SOL; // 2_000_000_000
    expect(curve.x.toNumber()).to.be.greaterThan(D);

    // y₀ decreased from INITIAL_Y (Founder Buy consumed some tokens)
    expect(curve.y.toString()).to.not.equal("1000000000000");
    const yAfterFounder = BigInt(curve.y.toString());
    expect(yAfterFounder).to.be.lessThan(BigInt("1000000000000"));

    // Creator received Founder Buy tokens
    expect(curve.supplyCreator.toNumber()).to.be.greaterThan(0);
    // Public supply starts at 0 (no public buy yet)
    expect(curve.supplyPublic.toNumber()).to.equal(0);
    // Protocol supply = 0 (Merit removed in v3.6)
    expect(curve.supplyProtocol.toNumber()).to.equal(0);

    // SOL reserve = sol_to_curve + fee_depth (from Founder Buy)
    expect(curve.solReserve.toNumber()).to.be.greaterThan(0);
    // But less than initial_liquidity (2% fee went to treasury)
    expect(curve.solReserve.toNumber()).to.be.lessThan(INITIAL_LIQUIDITY.toNumber());
    expect(curve.isActive).to.be.true;

    // Verify Creator Vault PDA
    const vault = await program.account.creatorVault.fetch(creatorVaultPda) as any;
    expect(vault.creator.toString()).to.equal(creator.publicKey.toString());
    expect(vault.totalSold.toNumber()).to.equal(0);

    // Verify Creator Fee Vault PDA
    const cfv = await program.account.creatorFeeVault.fetch(creatorFeeVaultPda) as any;
    expect(cfv.totalAccumulated.toNumber()).to.equal(0); // No trades yet — Founder Buy has no creator fee
    expect(cfv.totalClaimed.toNumber()).to.equal(0);

    // Verify creator received tokens (frozen)
    const creatorTokens = await provider.connection.getTokenAccountBalance(creatorAta);
    expect(parseInt(creatorTokens.value.amount)).to.be.greaterThan(0);

    console.log("    → BondingCurve PDA:", bondingCurvePda.toString());
    console.log("    → x:", curve.x.toString(), "| y:", curve.y.toString());
    console.log("    → k:", curve.k.toString());
    console.log("    → Founder tokens:", creatorTokens.value.uiAmountString);
    console.log("    → SOL reserve:", curve.solReserve.toString());
  });

  // =============================================
  // TEST 2: Buy Tokens (100% to buyer — no Merit)
  // =============================================
  it("✅ Buys tokens — 100% goes to buyer (no Merit Reward)", async () => {
    const solAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL

    const curveBefore = await program.account.bondingCurve.fetch(bondingCurvePda) as any;
    const supplyCreatorBefore = curveBefore.supplyCreator.toNumber();

    const tx = await program.methods
      .buy(solAmount, new anchor.BN(0)) // 0 = no slippage check
      .accountsStrict({
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        creatorFeeVault: creatorFeeVaultPda,
        purchaseLimiter: purchaseLimiterPda,
        buyerTokenAccount: buyerAta,
        treasury: TREASURY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    console.log("    → TX:", tx);

    // Verify buyer received tokens
    const buyerAccount = await provider.connection.getTokenAccountBalance(buyerAta);
    const buyerTokens = parseInt(buyerAccount.value.amount);
    expect(buyerTokens).to.be.greaterThan(0);

    // Verify creator did NOT receive any new tokens (Merit removed!)
    const curveAfter = await program.account.bondingCurve.fetch(bondingCurvePda) as any;
    expect(curveAfter.supplyCreator.toNumber()).to.equal(supplyCreatorBefore);
    // supply_protocol unchanged (always 0)
    expect(curveAfter.supplyProtocol.toNumber()).to.equal(0);

    // All tokens from this buy went to buyer
    expect(curveAfter.supplyPublic.toNumber()).to.equal(buyerTokens);

    // k should have grown (k-deepening from 1% fee)
    expect(BigInt(curveAfter.k.toString())).to.be.greaterThan(BigInt(curveBefore.k.toString()));

    // Creator fee vault should have accumulated 2% of the buy
    const cfv = await program.account.creatorFeeVault.fetch(creatorFeeVaultPda) as any;
    const expectedCreatorFee = Math.ceil(0.5 * LAMPORTS_PER_SOL * 200 / 10_000); // 2% of 0.5 SOL
    expect(cfv.totalAccumulated.toNumber()).to.be.greaterThanOrEqual(expectedCreatorFee - 1);

    console.log(`    → Buyer received: ${buyerAccount.value.uiAmountString} tokens (frozen ❄️)`);
    console.log(`    → Creator tokens unchanged: ${supplyCreatorBefore} (Merit removed ✅)`);
    console.log(`    → Creator fee vault: ${cfv.totalAccumulated.toNumber()} lamports`);
  });

  // =============================================
  // TEST 3: Sell Tokens (k-deepening)
  // =============================================
  it("✅ Sells tokens with k-deepening", async () => {
    const buyerAccount = await provider.connection.getTokenAccountBalance(buyerAta);
    const currentBalance = parseInt(buyerAccount.value.amount);
    const sellAmount = new anchor.BN(Math.floor(currentBalance / 2));

    const buyerSolBefore = await provider.connection.getBalance(buyer.publicKey);
    const kBefore = (await program.account.bondingCurve.fetch(bondingCurvePda) as any).k.toString();

    const tx = await program.methods
      .sell(sellAmount, new anchor.BN(0)) // 0 = no slippage check
      .accountsStrict({
        seller: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        creatorFeeVault: creatorFeeVaultPda,
        creatorVault: null, // buyer is NOT creator → no vault needed
        sellerTokenAccount: buyerAta,
        creatorWallet: creator.publicKey,
        treasury: TREASURY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    console.log("    → TX:", tx);

    const buyerSolAfter = await provider.connection.getBalance(buyer.publicKey);
    expect(buyerSolAfter).to.be.greaterThan(buyerSolBefore);

    const remaining = await provider.connection.getTokenAccountBalance(buyerAta);
    expect(parseInt(remaining.value.amount)).to.be.greaterThan(0);

    // k should have grown (k-deepening on sell too)
    const kAfter = (await program.account.bondingCurve.fetch(bondingCurvePda) as any).k.toString();
    expect(BigInt(kAfter)).to.be.greaterThan(BigInt(kBefore));

    console.log(`    → Sold: ${sellAmount.toNumber()} base units`);
    console.log(`    → SOL received: ${(buyerSolAfter - buyerSolBefore) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    → k grew: ${kBefore} → ${kAfter} ✅`);
  });

  // =============================================
  // TEST 4: Token Confinement (frozen)
  // =============================================
  it("❌ Blocks direct transfer (account frozen)", async () => {
    try {
      const { createTransferInstruction } = await import("@solana/spl-token");

      const randomWallet = Keypair.generate();
      const randomAta = getAssociatedTokenAddressSync(
        mint.publicKey,
        randomWallet.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );

      const transferIx = createTransferInstruction(
        buyerAta,
        randomAta,
        buyer.publicKey,
        1,
        [],
        TOKEN_2022_PROGRAM_ID
      );

      const tx = new anchor.web3.Transaction().add(transferIx);
      await provider.sendAndConfirm(tx, [buyer]);

      expect.fail("Transfer should have been rejected — account is frozen!");
    } catch (err: any) {
      // Expected: account is frozen → transfer fails
      console.log("    → Transfer blocked ✅ (error:", err.message?.substring(0, 60), "...)");
      expect(err.message || err.toString()).to.not.include("should have been rejected");
    }
  });

  // =============================================
  // TEST 5: Creator Sell = Blocked Year 1
  // =============================================
  it("❌ Blocks creator sell in Year 1", async () => {
    // Creator has Founder Buy tokens — try to sell them
    const creatorAccount = await provider.connection.getTokenAccountBalance(creatorAta);
    const sellAmount = new anchor.BN(Math.floor(parseInt(creatorAccount.value.amount) / 2));

    try {
      await program.methods
        .sell(sellAmount, new anchor.BN(0))
        .accountsStrict({
          seller: creator.publicKey,
          mint: mint.publicKey,
          bondingCurve: bondingCurvePda,
          creatorFeeVault: creatorFeeVaultPda,
          creatorVault: creatorVaultPda, // Creator MUST provide vault
          sellerTokenAccount: creatorAta,
          creatorWallet: creator.publicKey,
          treasury: TREASURY,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();

      expect.fail("Creator sell should have been rejected — Year 1 locked!");
    } catch (err: any) {
      console.log("    → Creator sell blocked: Year 1 = 0% sellable ✅");
      const errMsg = err.message || err.toString();
      expect(errMsg).to.include("CreatorVestingLocked");
    }
  });

  // =============================================
  // TEST 6: Fee Distribution (5% = 2+2+1)
  // =============================================
  it("✅ Verifies fee distribution (2% creator + 2% protocol + 1% depth)", async () => {
    const cfvBefore = (await program.account.creatorFeeVault.fetch(creatorFeeVaultPda) as any)
      .totalAccumulated.toNumber();
    const treasuryBefore = await provider.connection.getBalance(TREASURY);

    // Buy with 1 SOL to generate observable fees
    const solAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    await program.methods
      .buy(solAmount, new anchor.BN(0))
      .accountsStrict({
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        creatorFeeVault: creatorFeeVaultPda,
        purchaseLimiter: purchaseLimiterPda,
        buyerTokenAccount: buyerAta,
        treasury: TREASURY,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const cfvAfter = (await program.account.creatorFeeVault.fetch(creatorFeeVaultPda) as any)
      .totalAccumulated.toNumber();
    const treasuryAfter = await provider.connection.getBalance(TREASURY);

    const creatorFee = cfvAfter - cfvBefore;
    const treasuryFee = treasuryAfter - treasuryBefore;

    // 2% creator on 1 SOL = 20_000_000 lamports (ceil_div may add 1)
    expect(creatorFee).to.be.greaterThanOrEqual(20_000_000);
    expect(creatorFee).to.be.lessThanOrEqual(20_000_001);

    // 2% protocol on 1 SOL = 20_000_000 lamports
    // Protocol gets remainder: total(5%) - creator(2%) - depth(1%) = 2%
    expect(treasuryFee).to.be.greaterThanOrEqual(19_999_998);
    expect(treasuryFee).to.be.lessThanOrEqual(20_000_001);

    console.log(`    → Creator fee vault: ${creatorFee} lamports (2%)`);
    console.log(`    → Treasury fee: ${treasuryFee} lamports (2%)`);
    console.log(`    → Depth fee: stays in curve (1%) ✅`);
    console.log(`    → Total: 5% ✅`);
  });

  // =============================================
  // TEST 7: Slippage Protection
  // =============================================
  it("❌ Rejects buy when slippage exceeded", async () => {
    // Set min_tokens_out to an impossibly high value
    const solAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const absurdMinTokens = new anchor.BN("999999999999999"); // way too many

    try {
      await program.methods
        .buy(solAmount, absurdMinTokens)
        .accountsStrict({
          buyer: buyer.publicKey,
          mint: mint.publicKey,
          bondingCurve: bondingCurvePda,
          creatorFeeVault: creatorFeeVaultPda,
          purchaseLimiter: purchaseLimiterPda,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      expect.fail("Buy should have been rejected — slippage exceeded!");
    } catch (err: any) {
      console.log("    → Slippage protection works ✅");
      const errMsg = err.message || err.toString();
      expect(errMsg).to.include("SlippageExceeded");
    }
  });
});
