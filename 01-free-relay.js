/**
 * Legion SDK — Example: Free relay (no fee collected)
 *
 * Use this when you want to sponsor transactions for your users
 * without collecting any fee at all.
 */

const { LegionSDK, loadKeypairFromJSON } = require("../index");
const { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

async function main() {
  // ── 1. Load your relayer (backend) wallet ──────────────────────────────────
  //
  // The Solana CLI exports wallets as a JSON byte array.
  // Read yours from disk with: fs.readFileSync("~/.config/solana/id.json", "utf8")
  //
  // For this example we generate a new one:
  const { generateKeypair } = require("../index");
  const { keypair: relayerKeypair } = generateKeypair();

  console.log("Relayer address:", relayerKeypair.publicKey.toBase58());

  // ── 2. Initialise Legion (free — no fee config) ────────────────────────────
  const legion = new LegionSDK({
    rpcUrl: "https://api.mainnet-beta.solana.com",
    relayerKeypair,
    // fee: null  ← omitting fee means transactions are free for users
  });

  // ── 3. Build any transaction you like ─────────────────────────────────────
  const userKeypair = generateKeypair().keypair; // In production: the real user keypair
  const recipient = new PublicKey("11111111111111111111111111111112");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: userKeypair.publicKey,
      toPubkey: recipient,
      lamports: 0.001 * LAMPORTS_PER_SOL,
    })
  );

  // ── 4. Relay it ────────────────────────────────────────────────────────────
  // The relayer pays SOL gas. The user pays nothing in gas.
  // (This will fail unless the relayer wallet has SOL.)
  try {
    const sig = await legion.relay({
      transaction: tx,
      userKeypair,                        // server-side: pass the keypair directly
      userPublicKey: userKeypair.publicKey,
    });
    console.log("Transaction confirmed:", sig);
    console.log("Solscan:", `https://solscan.io/tx/${sig}`);
  } catch (err) {
    console.error("Relay failed:", err.message);

  }
}

main();