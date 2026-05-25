"use strict";

const {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  sendAndConfirmRawTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} = require("@solana/web3.js");

const {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

const _bs58 = require("bs58");
const bs58 = _bs58.default || _bs58;
const { LegionError, ErrorCodes } = require("./errors");
const { validateFeeConfig, validateWallet } = require("./validators");
const { loadKeypairFromJSON, loadKeypairFromBase58 } = require("./wallet");

/**
 * Legion SDK — Gas Abstraction Layer for Solana
 *
 * The relayer wallet (your backend wallet) signs and pays native SOL gas.
 * Users sign only their own instructions. The relayer optionally collects
 * a fee in any SPL token (or for free).
 *
 * @example
 * const legion = new LegionSDK({
 *   rpcUrl: "https://api.mainnet-beta.solana.com",
 *   relayerKeypair: Keypair.fromSecretKey(...),
 *   fee: {
 *     mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
 *     amount: 0.1,
 *     decimals: 6,
 *   },
 * });
 */
class LegionSDK {
  /**
   * @param {object}  opts
   * @param {string}  opts.rpcUrl               - Solana RPC endpoint
   * @param {Keypair} opts.relayerKeypair        - Backend wallet that pays gas & receives fees
   * @param {object}  [opts.fee]                 - Fee config (omit or set to null for free)
   * @param {string}  [opts.fee.mint]            - SPL token mint address for the fee
   * @param {number}  [opts.fee.amount]          - Human-readable fee amount (e.g. 0.1 for 0.1 USDC)
   * @param {number}  [opts.fee.decimals]        - Token decimals (e.g. 6 for USDC)
   * @param {string}  [opts.commitment]          - Commitment level (default: "confirmed")
   * @param {number}  [opts.maxRetries]          - Max send retries (default: 3)
   */
  constructor(opts = {}) {
    if (!opts.rpcUrl) throw new LegionError("rpcUrl is required", ErrorCodes.INVALID_CONFIG);
    if (!opts.relayerKeypair) throw new LegionError("relayerKeypair is required", ErrorCodes.INVALID_CONFIG);

    this.connection = new Connection(opts.rpcUrl, opts.commitment || "confirmed");
    this.relayer = opts.relayerKeypair;
    this.fee = opts.fee ? validateFeeConfig(opts.fee) : null;
    this.commitment = opts.commitment || "confirmed";
    this.maxRetries = opts.maxRetries || 3;
  }

  // ─────────────────────────────────────────────
  //  Static helpers to build a LegionSDK instance
  // ─────────────────────────────────────────────

  /**
   * Create an instance from a wallet JSON array (the format Solana CLI exports).
   * @param {object} opts - Same as constructor but relayerKeypair replaced by relayerWalletJson
   * @param {number[]|Uint8Array} opts.relayerWalletJson - Secret key as a JSON byte array
   */
  static fromWalletJSON(opts = {}) {
    const { relayerWalletJson, ...rest } = opts;
    const keypair = loadKeypairFromJSON(relayerWalletJson);
    return new LegionSDK({ ...rest, relayerKeypair: keypair });
  }

  /**
   * Create an instance from a base-58 encoded private key.
   * @param {object} opts - Same as constructor but relayerKeypair replaced by relayerPrivateKey
   * @param {string} opts.relayerPrivateKey - Base-58 secret key string
   */
  static fromPrivateKey(opts = {}) {
    const { relayerPrivateKey, ...rest } = opts;
    const keypair = loadKeypairFromBase58(relayerPrivateKey);
    return new LegionSDK({ ...rest, relayerKeypair: keypair });
  }

  // ─────────────────────────────────────────────
  //  Core: relay any transaction
  // ─────────────────────────────────────────────

  /**
   * Relay a transaction on behalf of a user.
   *
   * The relayer:
   *   1. Prepends an optional SPL fee-collection instruction
   *   2. Sets itself as feePayer (pays native SOL gas)
   *   3. Co-signs alongside the user
   *   4. Broadcasts and confirms the transaction
   *
   * @param {object}      params
   * @param {Transaction} params.transaction     - Pre-built transaction containing user instructions.
   *                                               Do NOT set feePayer or recentBlockhash — Legion handles both.
   * @param {Keypair|null} params.userKeypair    - User keypair (if signing server-side).
   *                                               Pass null if the user already partially signed.
   * @param {Buffer[]|null} [params.userSignatures] - Raw signatures from a client-side wallet adapter
   *                                               (pass when userKeypair is null).
   * @param {PublicKey}   params.userPublicKey   - User's public key (always required).
   * @param {object}      [params.feeOverride]   - Override the instance-level fee for this call.
   * @returns {Promise<string>}                  - Transaction signature
   */
  async relay({ transaction, userKeypair = null, userSignatures = null, userPublicKey, feeOverride }) {
    validateWallet(userPublicKey);

    const fee = feeOverride !== undefined ? (feeOverride ? validateFeeConfig(feeOverride) : null) : this.fee;

    // Fresh blockhash
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.commitment);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.relayer.publicKey;

    // Prepend fee instruction if configured
    if (fee) {
      const feeIx = await this._buildFeeInstruction(userPublicKey, fee);
      transaction.instructions.unshift(...feeIx);
    }

    // Sign: relayer always signs
    transaction.partialSign(this.relayer);

    // Sign: user
    if (userKeypair) {
      transaction.partialSign(userKeypair);
    } else if (userSignatures) {
      for (const sig of userSignatures) {
        transaction.addSignature(userPublicKey, sig);
      }
    }

    const rawTx = transaction.serialize();
    const signature = await this._sendWithRetry(rawTx, { blockhash, lastValidBlockHeight });
    return signature;
  }

  // ─────────────────────────────────────────────
  //  Convenience: relay a simple SOL transfer
  // ─────────────────────────────────────────────

  /**
   * Relay a SOL transfer from user to recipient.
   * @param {object}  params
   * @param {PublicKey|string} params.from       - Sender public key
   * @param {PublicKey|string} params.to         - Recipient public key
   * @param {number}  params.amountSol           - Amount in SOL
   * @param {Keypair|null} [params.userKeypair]  - User keypair (server-side signing)
   * @returns {Promise<string>}
   */
  async relaySolTransfer({ from, to, amountSol, userKeypair = null }) {
    const fromPk = new PublicKey(from);
    const toPk = new PublicKey(to);
    const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: fromPk, toPubkey: toPk, lamports })
    );

    return this.relay({ transaction: tx, userKeypair, userPublicKey: fromPk });
  }

  // ─────────────────────────────────────────────
  //  Convenience: relay an SPL token transfer
  // ─────────────────────────────────────────────

  /**
   * Relay an SPL token transfer from user to recipient.
   * Auto-creates recipient ATA if it does not exist (relayer pays for creation).
   * @param {object}  params
   * @param {PublicKey|string} params.from       - Sender public key
   * @param {PublicKey|string} params.to         - Recipient public key
   * @param {PublicKey|string} params.mint       - Token mint address
   * @param {number}  params.amount              - Human-readable amount
   * @param {number}  params.decimals            - Token decimals
   * @param {Keypair|null} [params.userKeypair]  - User keypair (server-side signing)
   * @returns {Promise<string>}
   */
  async relayTokenTransfer({ from, to, mint, amount, decimals, userKeypair = null }) {
    const fromPk = new PublicKey(from);
    const toPk = new PublicKey(to);
    const mintPk = new PublicKey(mint);
    const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));

    const fromATA = await getAssociatedTokenAddress(mintPk, fromPk);
    const toATA = await getAssociatedTokenAddress(mintPk, toPk);

    const tx = new Transaction();

    // Create recipient ATA if needed (relayer is payer)
    const toATAInfo = await this.connection.getAccountInfo(toATA);
    if (!toATAInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(
          this.relayer.publicKey, // payer
          toATA,
          toPk,
          mintPk
        )
      );
    }

    tx.add(
      createTransferInstruction(fromATA, toATA, fromPk, rawAmount, [], TOKEN_PROGRAM_ID)
    );

    return this.relay({ transaction: tx, userKeypair, userPublicKey: fromPk });
  }

  // ─────────────────────────────────────────────
  //  Client-side helpers (browser / wallet adapter)
  // ─────────────────────────────────────────────

  /**
   * Prepare a transaction for client-side signing (wallet adapter flow).
   *
   * Call this on your backend, return the serialized transaction to the frontend,
   * have the user sign it with their wallet, then call relay() with the signed bytes.
   *
   * @param {object}      params
   * @param {Transaction} params.transaction   - User's instructions (no feePayer / blockhash)
   * @param {PublicKey}   params.userPublicKey - User's public key
   * @param {object}      [params.feeOverride] - Per-call fee override
   * @returns {Promise<{serialized: string, blockhash: string, lastValidBlockHeight: number}>}
   */
  async prepareForClientSigning({ transaction, userPublicKey, feeOverride }) {
    validateWallet(userPublicKey);

    const fee = feeOverride !== undefined ? (feeOverride ? validateFeeConfig(feeOverride) : null) : this.fee;
    const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(this.commitment);

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.relayer.publicKey;

    if (fee) {
      const feeIx = await this._buildFeeInstruction(userPublicKey, fee);
      transaction.instructions.unshift(...feeIx);
    }

    // Relayer pre-signs
    transaction.partialSign(this.relayer);

    return {
      serialized: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      blockhash,
      lastValidBlockHeight,
    };
  }

  /**
   * Submit a transaction that has already been signed by the client wallet.
   * @param {string} serializedBase64 - Base64 serialized transaction (already signed by user)
   * @param {string} blockhash
   * @param {number} lastValidBlockHeight
   * @returns {Promise<string>} - Transaction signature
   */
  async submitSigned(serializedBase64, blockhash, lastValidBlockHeight) {
    const rawTx = Buffer.from(serializedBase64, "base64");
    return this._sendWithRetry(rawTx, { blockhash, lastValidBlockHeight });
  }

  // ─────────────────────────────────────────────
  //  Utility: get relayer info
  // ─────────────────────────────────────────────

  /**
   * Returns the relayer's public key as a string.
   */
  getRelayerAddress() {
    return this.relayer.publicKey.toBase58();
  }

  /**
   * Returns the relayer's current SOL balance.
   * @returns {Promise<number>} Balance in SOL
   */
  async getRelayerBalance() {
    const lamports = await this.connection.getBalance(this.relayer.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }

  // ─────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────

  /**
   * Build the SPL token fee collection instructions.
   * Transfers `fee.amount` tokens from the user's ATA to the relayer's ATA.
   */
  async _buildFeeInstruction(userPublicKey, fee) {
    const mintPk = new PublicKey(fee.mint);
    const userATA = await getAssociatedTokenAddress(mintPk, userPublicKey);
    const relayerATA = await getAssociatedTokenAddress(mintPk, this.relayer.publicKey);

    const instructions = [];

    // Create relayer ATA if it doesn't exist
    const relayerATAInfo = await this.connection.getAccountInfo(relayerATA);
    if (!relayerATAInfo) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.relayer.publicKey,
          relayerATA,
          this.relayer.publicKey,
          mintPk
        )
      );
    }

    const rawFee = BigInt(Math.round(fee.amount * Math.pow(10, fee.decimals)));

    instructions.push(
      createTransferInstruction(userATA, relayerATA, userPublicKey, rawFee, [], TOKEN_PROGRAM_ID)
    );

    return instructions;
  }

  /**
   * Send a raw transaction with retry logic.
   */
  async _sendWithRetry(rawTx, { blockhash, lastValidBlockHeight }) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const signature = await sendAndConfirmRawTransaction(
          this.connection,
          rawTx,
          { blockhash, lastValidBlockHeight, commitment: this.commitment }
        );
        return signature;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
    }
    throw new LegionError(
      `Transaction failed after ${this.maxRetries} attempts: ${lastError?.message}`,
      ErrorCodes.TRANSACTION_FAILED,
      lastError
    );
  }
}

module.exports = { LegionSDK };
