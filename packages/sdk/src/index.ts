// ========================================
// Humanofi SDK — Client for the Anchor Program
// ========================================

import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
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

export interface CreateTokenParams {
  name: string;
  symbol: string;
  uri: string;
  basePrice: number;
  curveFactor: number;
}

export interface BuyParams {
  mint: PublicKey;
  solAmount: number;
  treasury: PublicKey;
}

export interface SellParams {
  mint: PublicKey;
  tokenAmount: number;
}

export interface ClaimRewardsParams {
  mint: PublicKey;
}

export interface UnlockTokensParams {
  mint: PublicKey;
}

/**
 * HumanofiClient — High-level SDK for interacting with the Humanofi program.
 *
 * Wraps the Anchor program with typed methods for all instructions.
 */
export class HumanofiClient {
  private program: Program;
  private provider: AnchorProvider;

  constructor(provider: AnchorProvider, programId?: PublicKey) {
    this.provider = provider;
    // Program will be initialized with the IDL after build
    // For now, this is a placeholder structure
    this.program = null as any;
  }

  // ---- PDA Derivation ----

  /**
   * Derive the BondingCurve PDA for a given mint.
   */
  static deriveBondingCurve(
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_CURVE, mint.toBuffer()],
      programId
    );
  }

  /**
   * Derive the CreatorVault PDA for a given mint.
   */
  static deriveCreatorVault(
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_VAULT, mint.toBuffer()],
      programId
    );
  }

  /**
   * Derive the RewardPool PDA for a given mint.
   */
  static deriveRewardPool(
    mint: PublicKey,
    programId: PublicKey
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [SEED_REWARDS, mint.toBuffer()],
      programId
    );
  }

  /**
   * Derive the PurchaseLimiter PDA for a given wallet + mint.
   */
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

  /**
   * Derive the HolderRewardState PDA for a given mint + holder.
   */
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
   * Create a new personal token with bonding curve.
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
    const creatorTokenAccount = await getAssociatedTokenAddress(
      mint.publicKey,
      creator
    );

    const tx = await this.program.methods
      .createToken(
        params.name,
        params.symbol,
        params.uri,
        new BN(params.basePrice),
        new BN(params.curveFactor)
      )
      .accounts({
        creator,
        mint: mint.publicKey,
        creatorTokenAccount,
        bondingCurve,
        creatorVault,
        rewardPool,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    return { mint: mint.publicKey, txSignature: tx };
  }

  /**
   * Buy tokens from the bonding curve.
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
      buyer
    );

    // Fetch bonding curve to get creator
    const curveData = await this.program.account.bondingCurve.fetch(
      bondingCurve
    );

    const tx = await this.program.methods
      .buy(new BN(params.solAmount))
      .accounts({
        buyer,
        mint: params.mint,
        bondingCurve,
        rewardPool,
        purchaseLimiter,
        buyerTokenAccount,
        creatorWallet: curveData.creator,
        treasury: params.treasury,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { txSignature: tx };
  }

  /**
   * Sell tokens back to the bonding curve.
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
    const [purchaseLimiter] = HumanofiClient.derivePurchaseLimiter(
      seller,
      params.mint,
      this.program.programId
    );
    const sellerTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      seller
    );

    const curveData = await this.program.account.bondingCurve.fetch(
      bondingCurve
    );

    const tx = await this.program.methods
      .sell(new BN(params.tokenAmount))
      .accounts({
        seller,
        mint: params.mint,
        bondingCurve,
        rewardPool,
        purchaseLimiter,
        sellerTokenAccount,
        creatorWallet: curveData.creator,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { txSignature: tx };
  }

  /**
   * Claim accumulated rewards from the reward pool.
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
      holder
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { txSignature: tx };
  }

  /**
   * Unlock creator tokens after 12-month lock.
   */
  async unlockTokens(params: UnlockTokensParams) {
    const creator = this.provider.wallet.publicKey;

    const [creatorVault] = HumanofiClient.deriveCreatorVault(
      params.mint,
      this.program.programId
    );
    const vaultTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      creatorVault,
      true // allowOwnerOffCurve for PDA
    );
    const creatorTokenAccount = await getAssociatedTokenAddress(
      params.mint,
      creator
    );

    const tx = await this.program.methods
      .unlockTokens()
      .accounts({
        creator,
        mint: params.mint,
        creatorVault,
        vaultTokenAccount,
        creatorTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    return { txSignature: tx };
  }
}
