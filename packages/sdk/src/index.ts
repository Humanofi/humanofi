// ========================================
// Humanofi SDK — Client for the Anchor Program (v2 — Human Curve™)
// ========================================

import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

// PDA Seeds (must match the Anchor program)
const SEED_VAULT = Buffer.from("vault");
const SEED_CURVE = Buffer.from("curve");
const SEED_REWARDS = Buffer.from("rewards");
const SEED_LIMITER = Buffer.from("limiter");
const SEED_REWARD_STATE = Buffer.from("reward_state");

// Token-2022 program ID
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

export interface CreateTokenParams {
  name: string;
  symbol: string;
  uri: string;
  initialLiquidity: number; // in lamports
}

export interface BuyParams {
  mint: PublicKey;
  solAmount: number;         // in lamports
  minTokensOut?: number;     // slippage protection (0 = no check)
  treasury: PublicKey;
}

export interface SellParams {
  mint: PublicKey;
  tokenAmount: number;       // in base units (with decimals)
  minSolOut?: number;        // slippage protection (0 = no check)
  treasury: PublicKey;
}

export interface ClaimRewardsParams {
  mint: PublicKey;
}

/**
 * HumanofiClient — High-level SDK for interacting with the Humanofi program.
 *
 * Wraps the Anchor program with typed methods for all instructions.
 * V2: Human Curve™ (x·y=k), no unlock_tokens, slippage protection.
 */
export class HumanofiClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.provider = provider;
    // Program will be initialized with the IDL after build
    this.program = null as any;
  }

  // ---- PDA Derivation ----

  static deriveBondingCurve(
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_CURVE, mint.toBuffer()],
      programId
    );
  }

  static deriveCreatorVault(
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_VAULT, mint.toBuffer()],
      programId
    );
  }

  static deriveRewardPool(
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_REWARDS, mint.toBuffer()],
      programId
    );
  }

  static derivePurchaseLimiter(
    wallet: PublicKey,
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_LIMITER, wallet.toBuffer(), mint.toBuffer()],
      programId
    );
  }

  static deriveHolderRewardState(
    mint: PublicKey,
    holder: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_REWARD_STATE, mint.toBuffer(), holder.toBuffer()],
      programId
    );
  }

  // ---- Instructions ----

  /**
   * Create a new personal token with the Human Curve™.
   *
   * No tokens are minted at creation. The creator earns tokens
   * progressively via the Merit Reward (14%) on each buy.
   */
  async createToken(params: CreateTokenParams) {
    const mint = Keypair.generate();
    const creator = this.provider.wallet.publicKey;

    const [bondingCurve] = HumanofiClient.deriveBondingCurve(
      mint.publicKey,
      this.program.programId
    );
    const [creatorVault] = HumanofiClient.deriveCreatorVault(
      mint.publicKey,
      this.program.programId
    );
    const [rewardPool] = HumanofiClient.deriveRewardPool(
      mint.publicKey,
      this.program.programId
    );

    const tx = await this.program.methods
      .createToken(
        params.name,
        params.symbol,
        params.uri,
        new BN(params.initialLiquidity)
      )
      .accounts({
        creator,
        mint: mint.publicKey,
        bondingCurve,
        creatorVault,
        rewardPool,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([mint])
      .rpc();

    return { mint: mint.publicKey, txSignature: tx };
  }

  /**
   * Buy tokens from the Human Curve™.
   *
   * - SOL → curve (94%) + fees (6%)
   * - Mint buyer tokens + creator Merit Reward
   * - Slippage protection via minTokensOut
   */
  async buy(params: BuyParams) {
    const buyer = this.provider.wallet.publicKey;

    const [bondingCurve] = HumanofiClient.deriveBondingCurve(
      params.mint,
      this.program.programId
    );
    const [rewardPool] = HumanofiClient.deriveRewardPool(
      params.mint,
      this.program.programId
    );
    const [purchaseLimiter] = HumanofiClient.derivePurchaseLimiter(
      buyer,
      params.mint,
      this.program.programId
    );
    const buyerTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      buyer,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Fetch bonding curve to get creator
    const curveData = await this.program.account.bondingCurve.fetch(
      bondingCurve
    );

    // Creator's ATA for Merit Reward
    const creatorTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      (curveData as any).creator,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const tx = await this.program.methods
      .buy(
        new BN(params.solAmount),
        new BN(params.minTokensOut || 0)
      )
      .accounts({
        buyer,
        mint: params.mint,
        bondingCurve,
        rewardPool,
        purchaseLimiter,
        buyerTokenAccount,
        creatorTokenAccount,
        creatorWallet: (curveData as any).creator,
        treasury: params.treasury,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { txSignature: tx };
  }

  /**
   * Sell tokens back via the Human Curve™.
   *
   * - Burns tokens, returns SOL minus fees
   * - If creator: enforces Year 1 lock + Smart Sell Limiter + 30d cooldown
   * - Slippage protection via minSolOut
   */
  async sell(params: SellParams) {
    const seller = this.provider.wallet.publicKey;

    const [bondingCurve] = HumanofiClient.deriveBondingCurve(
      params.mint,
      this.program.programId
    );
    const [rewardPool] = HumanofiClient.deriveRewardPool(
      params.mint,
      this.program.programId
    );
    const [holderRewardState] = HumanofiClient.deriveHolderRewardState(
      params.mint,
      seller,
      this.program.programId
    );
    const sellerTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      seller,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const curveData = await this.program.account.bondingCurve.fetch(
      bondingCurve
    );

    // Check if seller is creator → include creator_vault
    const isCreator = seller.equals((curveData as any).creator);
    const remainingAccounts: any[] = [];

    let creatorVault: PublicKey | null = null;
    if (isCreator) {
      [creatorVault] = HumanofiClient.deriveCreatorVault(
        params.mint,
        this.program.programId
      );
    }

    const tx = await this.program.methods
      .sell(
        new BN(params.tokenAmount),
        new BN(params.minSolOut || 0)
      )
      .accounts({
        seller,
        mint: params.mint,
        bondingCurve,
        rewardPool,
        holderRewardState,
        creatorVault: creatorVault, // null if not creator → Anchor handles optional
        sellerTokenAccount,
        creatorWallet: (curveData as any).creator,
        treasury: params.treasury,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { txSignature: tx };
  }

  /**
   * Claim accumulated rewards from the reward pool.
   * Engagement-gated: holder must have >= MIN_ENGAGEMENT_ACTIONS.
   */
  async claimRewards(params: ClaimRewardsParams) {
    const holder = this.provider.wallet.publicKey;

    const [rewardPool] = HumanofiClient.deriveRewardPool(
      params.mint,
      this.program.programId
    );
    const [holderRewardState] = HumanofiClient.deriveHolderRewardState(
      params.mint,
      holder,
      this.program.programId
    );
    const holderTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      holder,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const tx = await this.program.methods
      .claimRewards()
      .accounts({
        holder,
        mint: params.mint,
        rewardPool,
        holderRewardState,
        holderTokenAccount,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .rpc();

    return { txSignature: tx };
  }
}
