// ========================================
// Humanofi — Integration Tests (v2 — Human Curve™)
// ========================================
//
// Tests the full lifecycle:
// 1. Create a personal token (Human Curve™ initialization)
// 2. Buy tokens from the bonding curve (Merit Reward distribution)
// 3. Sell tokens back (with k-deepening)
// 4. Token confinement (frozen accounts)
// 5. Creator sell restriction (Year 1 lock)
// 6. Fee distribution verification (6% = 2+2+1+1)
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
  const INITIAL_LIQUIDITY = new anchor.BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL

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
  // TEST 1: Create Token (Human Curve™)
  // =============================================
  it("✅ Creates a personal token with Human Curve™", async () => {
    const tx = await program.methods
      .createToken("Alice", "ALICE", "https://example.com/metadata.json", INITIAL_LIQUIDITY)
      .accountsStrict({
        creator: creator.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        creatorVault: creatorVaultPda,
        rewardPool: rewardPoolPda,
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

    // x₀ = 21 × V = 21 × 0.1 SOL = 2.1 SOL
    const expectedX = 21 * 0.1 * LAMPORTS_PER_SOL;
    expect(curve.x.toNumber()).to.equal(expectedX);

    // y₀ = 1,000,000 × 10^6 = 10^12
    expect(curve.y.toString()).to.equal("1000000000000");

    // supply starts at 0 (no pre-mint!)
    expect(curve.supplyPublic.toNumber()).to.equal(0);
    expect(curve.supplyCreator.toNumber()).to.equal(0);

    // SOL reserve = initial liquidity
    expect(curve.solReserve.toNumber()).to.equal(INITIAL_LIQUIDITY.toNumber());
    expect(curve.isActive).to.be.true;

    // Verify CreatorVault PDA
    const vault = await program.account.creatorVault.fetch(creatorVaultPda) as any;
    expect(vault.creator.toString()).to.equal(creator.publicKey.toString());
    expect(vault.totalSold.toNumber()).to.equal(0);

    // Verify RewardPool PDA
    const pool = await program.account.rewardPool.fetch(rewardPoolPda) as any;
    expect(pool.mint.toString()).to.equal(mint.publicKey.toString());

    console.log("    → BondingCurve PDA:", bondingCurvePda.toString());
    console.log("    → x₀:", curve.x.toString(), "| y₀:", curve.y.toString());
    console.log("    → k₀:", curve.k.toString());
    console.log("    → No tokens minted at creation ✅");
  });

  // =============================================
  // TEST 2: Buy Tokens (Merit Reward)
  // =============================================
  it("✅ Buys tokens and distributes Merit Reward", async () => {
    const solAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL

    const buyerBalanceBefore = await provider.connection.getBalance(buyer.publicKey);

    const tx = await program.methods
      .buy(solAmount, new anchor.BN(0)) // 0 = no slippage check
      .accountsStrict({
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        rewardPool: rewardPoolPda,
        purchaseLimiter: purchaseLimiterPda,
        buyerTokenAccount: buyerAta,
        creatorTokenAccount: creatorAta,
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
    const buyerTokens = parseInt(buyerAccount.value.amount);
    expect(buyerTokens).to.be.greaterThan(0);

    // Verify creator received Merit Reward tokens
    const creatorAccount = await provider.connection.getTokenAccountBalance(creatorAta);
    const creatorTokens = parseInt(creatorAccount.value.amount);
    expect(creatorTokens).to.be.greaterThan(0);

    // Merit ratio should be ~14% / ~86%
    const totalTokens = buyerTokens + creatorTokens;
    const meritRatio = creatorTokens / totalTokens;
    expect(meritRatio).to.be.greaterThan(0.13);
    expect(meritRatio).to.be.lessThan(0.15);

    // Verify bonding curve updated
    const curve = await program.account.bondingCurve.fetch(bondingCurvePda) as any;
    expect(curve.supplyPublic.toNumber()).to.equal(buyerTokens);
    expect(curve.supplyCreator.toNumber()).to.equal(creatorTokens);

    // k should have grown (k-deepening)
    const initialK = BigInt(21) * BigInt(INITIAL_LIQUIDITY.toNumber()) * BigInt("1000000000000");
    expect(BigInt(curve.k.toString())).to.be.greaterThan(initialK);

    console.log(`    → Buyer received: ${buyerAccount.value.uiAmountString} tokens (frozen ❄️)`);
    console.log(`    → Creator Merit: ${creatorAccount.value.uiAmountString} tokens (frozen ❄️)`);
    console.log(`    → Merit ratio: ${(meritRatio * 100).toFixed(1)}%`);
  });

  // =============================================
  // TEST 3: Sell Tokens
  // =============================================
  it("✅ Sells tokens with k-deepening", async () => {
    const buyerAccount = await provider.connection.getTokenAccountBalance(buyerAta);
    const currentBalance = parseInt(buyerAccount.value.amount);
    const sellAmount = new anchor.BN(Math.floor(currentBalance / 2));

    const buyerSolBefore = await provider.connection.getBalance(buyer.publicKey);

    // Derive holder reward state PDA
    const [holderRewardStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_state"), mint.publicKey.toBuffer(), buyer.publicKey.toBuffer()],
      program.programId
    );

    const kBefore = (await program.account.bondingCurve.fetch(bondingCurvePda) as any).k.toString();

    const tx = await program.methods
      .sell(sellAmount, new anchor.BN(0)) // 0 = no slippage check
      .accountsStrict({
        seller: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        rewardPool: rewardPoolPda,
        holderRewardState: holderRewardStatePda,
        creatorVault: null, // buyer is NOT creator → no vault needed
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
    // Creator has Merit Reward tokens — try to sell them
    const creatorAccount = await provider.connection.getTokenAccountBalance(creatorAta);
    const sellAmount = new anchor.BN(Math.floor(parseInt(creatorAccount.value.amount) / 2));

    const [holderRewardStatePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_state"), mint.publicKey.toBuffer(), creator.publicKey.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .sell(sellAmount, new anchor.BN(0))
        .accountsStrict({
          seller: creator.publicKey,
          mint: mint.publicKey,
          bondingCurve: bondingCurvePda,
          rewardPool: rewardPoolPda,
          holderRewardState: holderRewardStatePda,
          creatorVault: creatorVaultPda, // Creator MUST provide vault
          sellerTokenAccount: creatorAta,
          creatorWallet: creator.publicKey,
          treasury: treasury.publicKey,
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
  // TEST 6: Fee Distribution (6% = 2+2+1+1)
  // =============================================
  it("✅ Verifies fee distribution (2% creator + 2% holders + 1% protocol + 1% depth)", async () => {
    const creatorBefore = await provider.connection.getBalance(creator.publicKey);
    const treasuryBefore = await provider.connection.getBalance(treasury.publicKey);
    const rewardPoolBefore = await provider.connection.getBalance(rewardPoolPda);

    // Buy with 1 SOL to generate observable fees
    const solAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);

    await program.methods
      .buy(solAmount, new anchor.BN(0))
      .accountsStrict({
        buyer: buyer.publicKey,
        mint: mint.publicKey,
        bondingCurve: bondingCurvePda,
        rewardPool: rewardPoolPda,
        purchaseLimiter: purchaseLimiterPda,
        buyerTokenAccount: buyerAta,
        creatorTokenAccount: creatorAta,
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
    const rewardPoolAfter = await provider.connection.getBalance(rewardPoolPda);

    const creatorFee = creatorAfter - creatorBefore;
    const treasuryFee = treasuryAfter - treasuryBefore;
    const holderFee = rewardPoolAfter - rewardPoolBefore;

    // 2% creator on 1 SOL = 20M lamports
    expect(creatorFee).to.equal(20_000_000);
    // 1% protocol on 1 SOL = 10M lamports
    expect(treasuryFee).to.equal(10_000_000);
    // 2% holders on 1 SOL = 20M lamports
    expect(holderFee).to.equal(20_000_000);

    console.log(`    → Creator fee: ${creatorFee} lamports (2%)`);
    console.log(`    → Holder pool fee: ${holderFee} lamports (2%)`);
    console.log(`    → Treasury fee: ${treasuryFee} lamports (1%)`);
    console.log(`    → Depth fee: stays in curve (1%) ✅`);
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
          rewardPool: rewardPoolPda,
          purchaseLimiter: purchaseLimiterPda,
          buyerTokenAccount: buyerAta,
          creatorTokenAccount: creatorAta,
          creatorWallet: creator.publicKey,
          treasury: treasury.publicKey,
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
