/**
 * Legion SDK — Example: SPL token fee relay
 *
 * The relayer pays SOL gas and collects a USDC fee from the user.
 * The user's actual transaction (a SOL transfer here) goes through atomically.
 */

const { LegionSDK, generateKeypair } = require("../index");
const { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

// USDC on mainnet-beta
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function main() {
  const { keypair: relayerKeypair } = generateKeypair();
  const { keypair: userKeypair } = generateKeypair();

  console.log("Relayer:", relayerKeypair.publicKey.toBase58());
  console.log("User:   ", userKeypair.publicKey.toBase58());

  // ── Initialise Legion with a USDC fee ──────────────────────────────────────
  const legion = new LegionSDK({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    relayerKeypair,
    fee: {
      mint: USDC_MINT,   // collect fee in USDC
      amount: 0.05,      // 0.05 USDC per transaction
      decimals: 6,       // USDC has 6 decimals
    },
  });

  console.log("\nFee config: 0.05 USDC per relay");
  console.log("Relayer balance (SOL):", await legion.getRelayerBalance());

  // ── Build the user's transaction (any transaction at all) ─────────────────
  const recipient = new PublicKey("11111111111111111111111111111112");
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: recipient,
      lamports: 0.01 * LAMPORTS_PER_SOL,
    })
  );

  // ── Relay ──────────────────────────────────────────────────────────────────
  // Legion prepends a USDC transfer (user → relayer) before the user's IX.
  // Everything is atomic: if the fee fails, the whole tx fails.
  try {
    const sig = await legion.relay({
      transaction: tx,
      userKeypair,
      userPublicKey: userKeypair.publicKey,
    });
    console.log("\nTransaction confirmed:", sig);
    console.log("Solscan:", `https://solscan.io/tx/${sig}`);
  } catch (err) {
    console.error("Relay failed:", err.message);
  }
}

main();
