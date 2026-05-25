"use strict";

const { PublicKey } = require("@solana/web3.js");
const { LegionError, ErrorCodes } = require("./errors");

/**
 * Validates and normalises a fee configuration object.
 * @param {object} fee
 * @returns {object} Validated fee config
 */
function validateFeeConfig(fee) {
  if (!fee || typeof fee !== "object") {
    throw new LegionError("fee must be an object", ErrorCodes.INVALID_FEE_CONFIG);
  }
  if (!fee.mint || typeof fee.mint !== "string") {
    throw new LegionError("fee.mint must be a valid mint address string", ErrorCodes.INVALID_FEE_CONFIG);
  }
  try {
    new PublicKey(fee.mint);
  } catch {
    throw new LegionError(`fee.mint "${fee.mint}" is not a valid Solana public key`, ErrorCodes.INVALID_FEE_CONFIG);
  }
  if (typeof fee.amount !== "number" || fee.amount <= 0) {
    throw new LegionError("fee.amount must be a positive number", ErrorCodes.INVALID_FEE_CONFIG);
  }
  if (typeof fee.decimals !== "number" || !Number.isInteger(fee.decimals) || fee.decimals < 0) {
    throw new LegionError("fee.decimals must be a non-negative integer", ErrorCodes.INVALID_FEE_CONFIG);
  }
  return { mint: fee.mint, amount: fee.amount, decimals: fee.decimals };
}

/**
 * Validates a PublicKey or public key string.
 * @param {PublicKey|string} wallet
 * @returns {PublicKey}
 */
function validateWallet(wallet) {
  if (!wallet) {
    throw new LegionError("userPublicKey is required", ErrorCodes.INVALID_WALLET);
  }
  try {
    return wallet instanceof PublicKey ? wallet : new PublicKey(wallet);
  } catch {
    throw new LegionError(`"${wallet}" is not a valid Solana public key`, ErrorCodes.INVALID_WALLET);
  }
}

module.exports = { validateFeeConfig, validateWallet };
