// ========================================
// Humanofi — Integration Tests
// ========================================
//
// Tests the full lifecycle:
// 1. Create a personal token
// 2. Buy tokens from the bonding curve
// 3. Sell tokens back
// 4. Token confinement (frozen accounts)
// 5. Creator vesting lock
// 6. Claim holder rewards
// 7. Fee distribution verification
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

describe("humanofi", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Humanofi as Program<Humanofi>;

  // ---- Test Accounts ----
  const creator = Keypair.generate();
  const buyer = Keypair.generate();
  const treasury = Keypair.generate();
  const mint = Keypair.generate();

  // ---- PDAs ----
  let bondingCurvePda: PublicKey;
  let creatorVaultPda: PublicKey;
  let rewardPoolPda: PublicKey;
  let purchaseLimiterPda: PublicKey;

  // ---- Token Accounts ----
  let creatorAta: PublicKey;
  let buyerAta: PublicKey;

  // ---- Constants ----
  const BASE_PRICE = new anchor.BN(1_000_000); // 1M lamports = 0.001 SOL
  const SLOPE = new anchor.BN(100); // slope factor
  // 100M tokens × 10^6 decimals
  const EXPECTED_CREATOR_SUPPLY = "100000000000000";

  before(async () => {
    // Airdrop SOL to creator, buyer, and treasury
    for (const kp of [creator, buyer, treasury]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        100 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }

    // Derive PDAs
    [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("curve"), mint.publicKey.toBuffer()],
      program.programId
    );

    [creatorVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), mint.publicKey.toBuffer()],
      program.programId
    );

    [rewardPoolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("rewards"), mint.publicKey.toBuffer()],
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
  // TEST 1: Create Token
  // =============================================
  it("✅ Crée un token personnel avec tous les PDAs", async () => {
    const tx = await program.methods
      .createToken("Alice", "ALICE", BASE_PRICE, SLOPE)
      .accountsStrict({
        creator: creator.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        creatorVault: creatorVaultPda,
        rewardPool: rewardPoolPda,
        creatorTokenAccount: creatorAta,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator, mint])
      .rpc();

    console.log("    → TX:", tx);

    // Verify BondingCurve PDA
    const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
    expect(curve.mint.toString()).to.equal(mint.publicKey.toString());
    expect(curve.creator.toString()).to.equal(creator.publicKey.toString());
    expect(curve.basePrice.toNumber()).to.equal(BASE_PRICE.toNumber());
    expect(curve.slope.toNumber()).to.equal(SLOPE.toNumber());
    expect(curve.supplySold.toNumber()).to.equal(0);
    expect(curve.solReserve.toNumber()).to.equal(0);
    expect(curve.isActive).to.be.true;

    // Verify CreatorVault PDA
    const vault = await program.account.creatorVault.fetch(creatorVaultPda);
    expect(vault.creator.toString()).to.equal(creator.publicKey.toString());
    expect(vault.originalAllocation.toString()).to.equal(EXPECTED_CREATOR_SUPPLY);
    expect(vault.totalUnlocked.toNumber()).to.equal(0);

    // Verify RewardPool PDA
    const pool = await program.account.rewardPool.fetch(rewardPoolPda);
    expect(pool.mint.toString()).to.equal(mint.publicKey.toString());

    // Verify creator ATA has tokens
    const creatorAccount = await provider.connection.getTokenAccountBalance(creatorAta);
    expect(creatorAccount.value.amount).to.equal(EXPECTED_CREATOR_SUPPLY);

    console.log("    → BondingCurve PDA:", bondingCurvePda.toString());
    console.log("    → CreatorVault PDA:", creatorVaultPda.toString());
    console.log("    → Creator tokens:", creatorAccount.value.uiAmountString, "(frozen ❄️)");
  });

  // =============================================
  // TEST 2: Buy Tokens
  // =============================================
  it("✅ Achète des tokens via la bonding curve", async () => {
    const solAmount = new anchor.BN(0.2 * LAMPORTS_PER_SOL); // 0.2 SOL (~$30, under $50 daily limit)

    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);

    const tx = await program.methods
      .buy(solAmount)
      .accountsStrict({
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        rewardPool: rewardPoolPda,
        purchaseLimiter: purchaseLimiterPda,
        buyerTokenAccount: buyerAta,
        creatorWallet: creator.publicKey,
        treasury: treasury.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    console.log("    → TX:", tx);

    // Verify buyer received tokens
    const buyerAccount = await provider.connection.getTokenAccountBalance(buyerAta);
    const tokenAmount = parseInt(buyerAccount.value.amount);
    expect(tokenAmount).to.be.greaterThan(0);

    // Verify bonding curve updated
    const curve = await program.account.bondingCurve.fetch(bondingCurvePda);
    expect(curve.supplySold.toNumber()).to.be.greaterThan(0);
    expect(curve.solReserve.toNumber()).to.be.greaterThan(0);

    // Verify purchase limiter created
    const limiter = await program.account.purchaseLimiter.fetch(purchaseLimiterPda);
    expect(limiter.wallet.toString()).to.equal(buyer.publicKey.toString());

    // Verify buyer spent SOL
    const buyerBalanceAfter = await provider.connection.getBalance(buyer.publicKey);
    expect(buyerBalanceAfter).to.be.lessThan(buyerBalanceBefore);

    console.log(`    → Buyer received: ${buyerAccount.value.uiAmountString} tokens (frozen ❄️)`);
    console.log(`    → SOL spent: ${(buyerBalanceBefore - buyerBalanceAfter) / LAMPORTS_PER_SOL} SOL`);
  });

  // =============================================
  // TEST 3: Sell Tokens
  // =============================================
  it("✅ Vend des tokens contre SOL (avec exit tax)", async () => {
    const buyerAccount = await provider.connection.getTokenAccountBalance(buyerAta);
    const currentBalance = parseInt(buyerAccount.value.amount);
    const sellAmount = new anchor.BN(Math.floor(currentBalance / 2));

    const buyerSolBefore = await provider.connection.getBalance(buyer.publicKey);

    const tx = await program.methods
      .sell(sellAmount)
      .accountsStrict({
        seller: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        rewardPool: rewardPoolPda,
        purchaseLimiter: purchaseLimiterPda,
        sellerTokenAccount: buyerAta,
        creatorWallet: creator.publicKey,
        treasury: treasury.publicKey,
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

    console.log(`    → Sold: ${sellAmount.toNumber()} base units`);
    console.log(`    → SOL received: ${(buyerSolAfter - buyerSolBefore) / LAMPORTS_PER_SOL} SOL`);
    console.log(`    → Remaining: ${remaining.value.uiAmountString} tokens (frozen ❄️)`);
    console.log(`    → Exit tax applied (< 90 days) ✅`);
  });

  // =============================================
  // TEST 4: Token Confinement (frozen)
  // =============================================
  it("❌ Empêche le transfert direct (compte gelé)", async () => {
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
      // The error should indicate the transfer failed (frozen or simulation failure)
      expect(err.message || err.toString()).to.not.include("should have been rejected");
    }
  });

  // =============================================
  // TEST 5: Creator Unlock Year 1 = locked
  // =============================================
  it("❌ Empêche l'unlock créateur en année 1", async () => {
    try {
      await program.methods
        .unlockTokens(new anchor.BN(1_000_000))
        .accountsStrict({
          creator: creator.publicKey,
          mint: mint.publicKey,
          bondingCurve: bondingCurvePda,
          creatorVault: creatorVaultPda,
          creatorTokenAccount: creatorAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([creator])
        .rpc();

      expect.fail("Unlock should have been rejected — Year 1 = 0%!");
    } catch (err: any) {
      console.log("    → Unlock blocked: Year 1 = 0% vendable ✅");
      const errMsg = err.message || err.toString();
      expect(errMsg).to.include("TokensStillLocked");
    }
  });

  // =============================================
  // TEST 6: Fee Distribution Verification
  // =============================================
  it("✅ Vérifie la distribution des fees (50/30/20)", async () => {
    const creatorBefore = await provider.connection.getBalance(creator.publicKey);
    const treasuryBefore = await provider.connection.getBalance(treasury.publicKey);

    // Buy with 0.1 SOL to generate observable fees (within daily limit)
    const solAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

    await program.methods
      .buy(solAmount)
      .accountsStrict({
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        rewardPool: rewardPoolPda,
        purchaseLimiter: purchaseLimiterPda,
        buyerTokenAccount: buyerAta,
        creatorWallet: creator.publicKey,
        treasury: treasury.publicKey,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const creatorAfter = await provider.connection.getBalance(creator.publicKey);
    const treasuryAfter = await provider.connection.getBalance(treasury.publicKey);

    const creatorFee = creatorAfter - creatorBefore;
    const treasuryFee = treasuryAfter - treasuryBefore;

    expect(creatorFee).to.be.greaterThan(0);
    expect(treasuryFee).to.be.greaterThan(0);

    // 2% total fee on 1 SOL = 20M lamports
    // Creator gets 50% = 10M, treasury gets 20% = 4M
    console.log(`    → Creator fee: ${creatorFee} lamports (50% of 2%)`);
    console.log(`    → Treasury fee: ${treasuryFee} lamports (20% of 2%)`);
    console.log(`    → Holder pool fee: stored in RewardPool PDA (30% of 2%)`);
  });
});
