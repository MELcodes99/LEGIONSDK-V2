/**
 * Legion SDK — Example: Relay any arbitrary transaction
 *
 * Legion is not limited to simple transfers. You can wrap ANY Solana
 * instructions — prediction markets, DEX swaps, position opens,
 * staking, NFT minting, program CPIs — anything.
 *
 * This example shows how to relay a generic set of instructions.
 */

const { LegionSDK, generateKeypair } = require("../index");
const {
  Transaction,
  TransactionInstruction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");

// ── Simulate a "prediction market" instruction ─────────────────────────────
//
// In a real integration you'd import from the protocol's SDK:
//   e.g. import { placeBet } from "@protocol/sdk";
//
// Here we build a raw instruction to demonstrate the pattern.
function buildPlaceBetInstruction({ userPublicKey, marketAddress, amount, side }) {
  // In production: replace with the protocol's actual instruction builder
  return new TransactionInstruction({
    programId: new PublicKey("11111111111111111111111111111111"), // placeholder
    keys: [
      { pubkey: userPublicKey, isSigner: true, isWritable: true },
      { pubkey: new PublicKey(marketAddress), isSigner: false, isWritable: true },
    ],
    data: Buffer.from(
      JSON.stringify({ action: "bet", side, amount }),
      "utf8"
    ),
  });
}

async function main() {
  const { keypair: relayerKeypair } = generateKeypair();
  const { keypair: userKeypair } = generateKeypair();

  const legion = new LegionSDK({
    rpcUrl: "https://api.devnet.solana.com",
    relayerKeypair,
    fee: {
      mint: "So11111111111111111111111111111111111111112", // Wrapped SOL as fee example
      amount: 0.001,
      decimals: 9,
    },
  });

  // ── Example 1: Prediction market bet ──────────────────────────────────────
  console.log("── Example 1: Prediction market ──");
  {
    const betIx = buildPlaceBetInstruction({
      userPublicKey: userKeypair.publicKey,
      marketAddress: "11111111111111111111111111111112",
      amount: 10,
      side: "YES",
    });

    const tx = new Transaction().add(betIx);

    console.log("Built prediction market tx with", tx.instructions.length, "instruction(s)");
    console.log("Would relay with fee:", legion.fee);
  }

  // ── Example 2: Override fee to free for this specific call ─────────────────
  console.log("\n── Example 2: Per-call free override ──");
  {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userKeypair.publicKey,
        toPubkey: relayerKeypair.publicKey,
        lamports: 1000,
      })
    );

    // Pass feeOverride: null to make this specific relay free,
    // even though the LegionSDK instance has a fee configured.
    console.log("Relaying with feeOverride: null (free for this call)");
    // await legion.relay({ transaction: tx, userKeypair, userPublicKey: userKeypair.publicKey, feeOverride: null });
  }

  // ── Example 3: Override fee to a different token for this call ─────────────
  console.log("\n── Example 3: Per-call fee token override ──");
  {
    const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userKeypair.publicKey,
        toPubkey: relayerKeypair.publicKey,
        lamports: 1000,
      })
    );

    console.log("Relaying with BONK fee override (1000 BONK per tx)");
    // await legion.relay({
    //   transaction: tx,
    //   userKeypair,
    //   userPublicKey: userKeypair.publicKey,
    //   feeOverride: { mint: BONK_MINT, amount: 1000, decimals: 5 },
    // });
  }

  // ── Example 4: Convenience helper — token transfer ─────────────────────────
  console.log("\n── Example 4: SPL token transfer helper ──");
  {
    const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    console.log("Would relay USDC transfer via legion.relayTokenTransfer()");
    // await legion.relayTokenTransfer({
    //   from: userKeypair.publicKey,
    //   to: "RecipientAddress...",
    //   mint: USDC,
    //   amount: 5,      // 5 USDC
    //   decimals: 6,
    //   userKeypair,
    // });
  }

  console.log("\nAll examples built successfully.");
}

main();
