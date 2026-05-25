/**
 * Legion SDK — Example: Client-side wallet adapter flow
 *
 * Use this pattern when the user's wallet lives in the browser
 * (Phantom, Solflare, etc.) and cannot be accessed server-side.
 *
 * Flow:
 *   1. Frontend sends the intended action to your backend API
 *   2. Backend calls legion.prepareForClientSigning() → returns a base64 tx
 *   3. Frontend signs the tx with wallet.signTransaction()
 *   4. Frontend sends signed base64 back to your backend
 *   5. Backend calls legion.submitSigned() → broadcasts to Solana
 *
 * This file shows both halves (backend logic + frontend pseudocode).
 */

// ════════════════════════════════════════════
//  BACKEND (Node.js / Express / Next.js API)
// ════════════════════════════════════════════

const { LegionSDK, loadKeypairFromJSON } = require("../index");
const { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const fs = require("fs");

// Load relayer from Solana CLI JSON file
// const walletJson = fs.readFileSync(process.env.RELAYER_WALLET_PATH, "utf8");
// const legion = LegionSDK.fromWalletJSON({ rpcUrl: "...", relayerWalletJson: walletJson, fee: {...} });

async function backendPrepare({ userPublicKey, recipientAddress, amountSol }) {
  // (Replace with a real legion instance in production)
  const { generateKeypair } = require("../index");
  const legion = new LegionSDK({
    rpcUrl: "https://api.devnet.solana.com",
    relayerKeypair: generateKeypair().keypair,
    fee: {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      amount: 0.05,
      decimals: 6,
    },
  });

  const userPk = new PublicKey(userPublicKey);
  const recipientPk = new PublicKey(recipientAddress);

  // Build the transaction — any instructions the user wants to execute
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: userPk,
      toPubkey: recipientPk,
      lamports: Math.round(amountSol * LAMPORTS_PER_SOL),
    })
  );

  // Prepare: relayer pre-signs, fee IX prepended, blockhash set
  const prepared = await legion.prepareForClientSigning({
    transaction: tx,
    userPublicKey: userPk,
  });

  // Return to frontend:
  return {
    serialized: prepared.serialized,          // base64 string
    blockhash: prepared.blockhash,
    lastValidBlockHeight: prepared.lastValidBlockHeight,
  };
}

async function backendSubmit({ serializedBase64, blockhash, lastValidBlockHeight }) {
  const { generateKeypair } = require("../index");
  const legion = new LegionSDK({
    rpcUrl: "https://api.devnet.solana.com",
    relayerKeypair: generateKeypair().keypair,
  });

  const signature = await legion.submitSigned(serializedBase64, blockhash, lastValidBlockHeight);
  return { signature, solscan: `https://solscan.io/tx/${signature}?cluster=devnet` };
}

// ════════════════════════════════════════════
//  FRONTEND (React + wallet adapter pseudocode)
// ════════════════════════════════════════════

/*
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

const { signTransaction } = useWallet();

async function handleSend() {
  // 1. Ask backend to prepare the transaction
  const { serialized, blockhash, lastValidBlockHeight } = await fetch("/api/prepare", {
    method: "POST",
    body: JSON.stringify({ userPublicKey: wallet.publicKey.toBase58(), recipientAddress, amountSol }),
  }).then(r => r.json());

  // 2. Deserialise
  const tx = Transaction.from(Buffer.from(serialized, "base64"));

  // 3. User signs (Phantom/Solflare popup appears here)
  const signedTx = await signTransaction(tx);

  // 4. Send signed tx back to backend
  const { signature } = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify({
      serializedBase64: signedTx.serialize().toString("base64"),
      blockhash,
      lastValidBlockHeight,
    }),
  }).then(r => r.json());

  console.log("Confirmed:", signature);
}
*/

// ── Quick smoke test of the backend helpers ────────────────────────────────
async function main() {
  console.log("Simulating backend prepare step...");
  try {
    const { generateKeypair } = require("../index");
    const user = generateKeypair();
    const recipient = generateKeypair();

    const prepared = await backendPrepare({
      userPublicKey: user.publicKey,
      recipientAddress: recipient.publicKey,
      amountSol: 0.001,
    });

    console.log("Prepared transaction (base64 snippet):", prepared.serialized.slice(0, 40) + "...");
    console.log("Blockhash:", prepared.blockhash);
    console.log("\nFrontend would now call wallet.signTransaction() and POST back the result.");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

main();
