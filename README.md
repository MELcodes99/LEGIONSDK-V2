# Legion SDK

**Gas abstraction for Solana.** Your backend wallet pays native SOL transaction fees on behalf of users. You optionally collect a fee in any SPL token — or make transactions completely free. Works for any transaction type: token transfers, prediction markets, DEX swaps, payment rails, position opens, NFT mints, program calls — anything.

---

## How it works

```
User builds a transaction
        │
        ▼
Legion prepends an SPL fee instruction (optional)
        │
        ▼
Relayer (your backend wallet) sets itself as feePayer + co-signs
        │
        ▼
Transaction hits Solana — user pays zero SOL gas
Relayer pays the SOL fee, receives your chosen SPL token fee (or nothing)
```

Everything is **atomic**: if the fee transfer fails, the whole transaction fails. There is no way for a user to get their transaction through without paying the fee.

---

## Installation

```bash
npm install legion-sdk
```

Or clone this repo directly:

```bash
git clone https://github.com/MELcodes99/LEGIONSDK-V2.git
cd LEGIONSDK-V2
npm install
```

**Requirements:** Node.js ≥ 16

---

## Quick start

```js
const { LegionSDK } = require("legion-sdk");
const { Keypair } = require("@solana/web3.js");

// Load your relayer keypair (see Wallet section below)
const relayerKeypair = Keypair.fromSecretKey(Uint8Array.from([/* your key bytes */]));

const legion = new LegionSDK({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  relayerKeypair,
  fee: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    amount: 0.05,   // 0.05 USDC per transaction
    decimals: 6,
  },
});

// Relay any transaction
const signature = await legion.relay({
  transaction: myTransaction,   // your pre-built Transaction object
  userKeypair: userKeypair,     // or use client-side signing (see below)
  userPublicKey: userKeypair.publicKey,
});

console.log("Confirmed:", signature);
```

---

## Loading your relayer wallet

The relayer is your backend wallet that pays Solana network fees on behalf of your users. You need to load it into the SDK using your private key.

This guide uses the **base-58 private key method** — the simplest and most compatible approach, works with Phantom, Solflare, and any Solana wallet.

---

### Step 1 — Get your base-58 private key

**From Phantom:**
1. Open Phantom wallet
2. Click the hamburger menu (☰) top-left
3. Click **Settings**
4. Click **Security & Privacy**
5. Click **Export Private Key**
6. Enter your password
7. Copy the key shown — it looks like a long random string e.g. `4xKpN7...`

**From Solflare:**
1. Open Solflare wallet
2. Click **Settings** (bottom right)
3. Click **Export Wallet**
4. Choose **Private Key**
5. Enter your password and copy the key

---

### Step 2 — Create the wallet loader file

In your project folder, create a new file called `load-wallet.js` and paste this code into it exactly:

```js
const { LegionSDK } = require("legion-sdk");

const legion = LegionSDK.fromPrivateKey({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  relayerPrivateKey: "PASTE_YOUR_PRIVATE_KEY_HERE",
  fee: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amount: 0.01,
    decimals: 6,
  },
});

async function main() {
  console.log("Relayer address:", legion.getRelayerAddress());
  console.log("Relayer SOL balance:", await legion.getRelayerBalance(), "SOL");
  console.log("Wallet loaded successfully.");
}

main().catch(console.error);
```

Replace `PASTE_YOUR_PRIVATE_KEY_HERE` with the key you copied in Step 1. Keep the quotes around it.

---

### Step 3 — Run it to confirm it works

```bash
node load-wallet.js
```

You should see output like:

```
Relayer address: 7xKpN7...
Relayer SOL balance: 0.05 SOL
Wallet loaded successfully.
```

If you see your correct wallet address, the key loaded correctly and the SDK is ready to use.

---

### Step 4 — Move the key to an environment variable (recommended)

Hardcoding the private key in a file is fine for local testing but you should use an environment variable before deploying anywhere.

Create a file called `.env` in your project root:

```
RELAYER_PRIVATE_KEY=PASTE_YOUR_PRIVATE_KEY_HERE
```

Install dotenv:

```bash
npm install dotenv
```

Then update your code to read from the environment:

```js
require("dotenv").config();
const { LegionSDK } = require("legion-sdk");

const legion = LegionSDK.fromPrivateKey({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  relayerPrivateKey: process.env.RELAYER_PRIVATE_KEY,
  fee: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    amount: 0.01,
    decimals: 6,
  },
});
```

Add `.env` to your `.gitignore` so it is never committed to Git:

```bash
echo ".env" >> .gitignore
```

---

> ⚠️ **Never share your private key. Never commit it to Git. Anyone who has it has full control of your wallet.**

---

## Fee configuration

### Collect a fee in any SPL token

Set the `fee` option on the constructor (or `fromWalletJSON` / `fromPrivateKey`).

```js
fee: {
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // any SPL token mint address
  amount: 0.1,    // human-readable amount (e.g. 0.1 USDC, not 100000 raw)
  decimals: 6,    // token decimals — check the token's mint info
}
```

Common tokens:

| Token | Mint address | Decimals |
|-------|-------------|----------|
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| USDT  | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 |
| BONK  | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 |
| JUP   | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`  | 6 |
| SOL (wrapped) | `So11111111111111111111111111111111111111112` | 9 |

### Make transactions free

Omit the `fee` option entirely, or pass `fee: null`:

```js
const legion = new LegionSDK({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  relayerKeypair,
  // no fee — you sponsor all transactions
});
```

### Override fee per call

You can override the fee for a single `relay()` call without changing the instance config:

```js
// Free for this specific call
await legion.relay({ transaction, userKeypair, userPublicKey, feeOverride: null });

// Different token / amount for this call
await legion.relay({
  transaction,
  userKeypair,
  userPublicKey,
  feeOverride: { mint: BONK_MINT, amount: 1000, decimals: 5 },
});
```

---

## Relay any transaction

### The `relay()` method — universal entry point

Pass any pre-built `Transaction` object. Legion handles feePayer, blockhash, fee prepending, signing, and broadcasting.

```js
const { Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");

// Build whatever transaction you need
const tx = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: userPublicKey,
    toPubkey: recipientPublicKey,
    lamports: 0.5 * LAMPORTS_PER_SOL,
  })
);

// Legion handles the rest
const signature = await legion.relay({
  transaction: tx,
  userKeypair,               // Keypair — for server-side signing
  userPublicKey,             // always required
});
```

### Convenience: SOL transfer

```js
const sig = await legion.relaySolTransfer({
  from: userKeypair.publicKey,
  to: recipientAddress,
  amountSol: 0.5,
  userKeypair,
});
```

### Convenience: SPL token transfer

Auto-creates recipient ATA if it does not exist (relayer pays for creation).

```js
const sig = await legion.relayTokenTransfer({
  from: userKeypair.publicKey,
  to: recipientAddress,
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  amount: 5,        // 5 USDC
  decimals: 6,
  userKeypair,
});
```

### Any arbitrary transaction

```js
// DEX swap, prediction market, position open, payment, NFT mint — anything
const tx = new Transaction();
tx.add(myProtocolInstruction1);
tx.add(myProtocolInstruction2);
// ...

const sig = await legion.relay({
  transaction: tx,
  userKeypair,
  userPublicKey: userKeypair.publicKey,
});
```

---

## Client-side signing (browser wallet adapter)

When users sign transactions in the browser with Phantom, Solflare, or any other wallet adapter, use the two-step prepare/submit flow.

### Backend — prepare

```js
// POST /api/prepare
const prepared = await legion.prepareForClientSigning({
  transaction: tx,
  userPublicKey: new PublicKey(req.body.userPublicKey),
});

res.json({
  serialized: prepared.serialized,                   // base64 string → send to frontend
  blockhash: prepared.blockhash,
  lastValidBlockHeight: prepared.lastValidBlockHeight,
});
```

### Frontend — sign & submit

```js
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";

const { signTransaction } = useWallet();

// 1. Get the prepared transaction from your backend
const { serialized, blockhash, lastValidBlockHeight } = await fetch("/api/prepare", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ userPublicKey: publicKey.toBase58(), ...params }),
}).then(r => r.json());

// 2. Deserialise
const tx = Transaction.from(Buffer.from(serialized, "base64"));

// 3. User signs — wallet popup appears here (shows fee + main transaction)
const signedTx = await signTransaction(tx);

// 4. Send signed tx back to your backend
const { signature } = await fetch("/api/submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    serializedBase64: signedTx.serialize().toString("base64"),
    blockhash,
    lastValidBlockHeight,
  }),
}).then(r => r.json());
```

### Backend — submit

```js
// POST /api/submit
const signature = await legion.submitSigned(
  req.body.serializedBase64,
  req.body.blockhash,
  req.body.lastValidBlockHeight
);

res.json({ signature, solscan: `https://solscan.io/tx/${signature}` });
```

---

## API reference

### `new LegionSDK(opts)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `rpcUrl` | `string` | ✅ | Solana RPC endpoint |
| `relayerKeypair` | `Keypair` | ✅ | Backend wallet that pays gas |
| `fee` | `object\|null` | — | Fee config (omit for free) |
| `fee.mint` | `string` | ✅ if fee | SPL token mint address |
| `fee.amount` | `number` | ✅ if fee | Human-readable fee amount |
| `fee.decimals` | `number` | ✅ if fee | Token decimals |
| `commitment` | `string` | — | Commitment level (default: `"confirmed"`) |
| `maxRetries` | `number` | — | Send retries (default: `3`) |

### `LegionSDK.fromWalletJSON(opts)`

Same as constructor but accepts `relayerWalletJson` (JSON byte array) instead of `relayerKeypair`.

### `LegionSDK.fromPrivateKey(opts)`

Same as constructor but accepts `relayerPrivateKey` (base-58 string) instead of `relayerKeypair`.

### `legion.relay(params)` → `Promise<string>`

| Param | Type | Description |
|-------|------|-------------|
| `transaction` | `Transaction` | Pre-built transaction (no feePayer or blockhash needed) |
| `userPublicKey` | `PublicKey\|string` | Always required |
| `userKeypair` | `Keypair\|null` | Server-side signing. Pass `null` if using `userSignatures` |
| `userSignatures` | `Buffer[]\|null` | Client-side signatures. Alternative to `userKeypair` |
| `feeOverride` | `object\|null` | Per-call fee override. `null` = free for this call |

### `legion.prepareForClientSigning(params)` → `Promise<{serialized, blockhash, lastValidBlockHeight}>`

Prepares a transaction for client-side signing. Returns a base64-encoded partially-signed transaction.

### `legion.submitSigned(serializedBase64, blockhash, lastValidBlockHeight)` → `Promise<string>`

Broadcasts a fully-signed transaction.

### `legion.relaySolTransfer(params)` → `Promise<string>`

Convenience wrapper for SOL transfers.

### `legion.relayTokenTransfer(params)` → `Promise<string>`

Convenience wrapper for SPL token transfers. Auto-creates recipient ATA.

### `legion.getRelayerAddress()` → `string`

Returns the relayer's public key as a base-58 string.

### `legion.getRelayerBalance()` → `Promise<number>`

Returns the relayer's SOL balance. Monitor this — if it runs out, relaying stops.

### Wallet utilities

```js
const {
  loadKeypairFromJSON,     // (json: string | number[]) => Keypair
  loadKeypairFromBase58,   // (base58: string) => Keypair
  exportKeypairToJSON,     // (keypair: Keypair) => string (Solana CLI format)
  exportKeypairToBase58,   // (keypair: Keypair) => string
  generateKeypair,         // () => { keypair, publicKey, secretKeyJSON, secretKeyBase58 }
} = require("legion-sdk");
```

---

## Security

- **Never expose your relayer private key on the frontend.** All Legion logic runs on your backend.
- The relayer's SOL balance is your operational runway — top it up regularly.
- Use environment variables for private keys: `process.env.RELAYER_PRIVATE_KEY`
- Consider rate-limiting your relay endpoints to prevent abuse.
- The fee instruction is atomic with the user's transaction. A user cannot bypass the fee.

---

## Examples

| File | Description |
|------|-------------|
| `examples/01-free-relay.js` | Relay with no fee (full gas sponsorship) |
| `examples/02-spl-fee-relay.js` | Relay with a USDC fee |
| `examples/03-client-wallet-adapter.js` | Browser wallet adapter flow (Phantom / Solflare) |
| `examples/04-arbitrary-transactions.js` | Prediction markets, swaps, any instruction |

Run an example:

```bash
node examples/01-free-relay.js
```

---
