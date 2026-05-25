"use strict";

const { LegionSDK } = require("./src/LegionSDK");
const { LegionError, ErrorCodes } = require("./src/errors");
const {
  loadKeypairFromJSON,
  loadKeypairFromBase58,
  exportKeypairToJSON,
  exportKeypairToBase58,
  generateKeypair,
} = require("./src/wallet");
const { validateFeeConfig, validateWallet } = require("./src/validators");

module.exports = {
  // Core
  LegionSDK,

  // Errors
  LegionError,
  ErrorCodes,

  // Wallet utilities
  loadKeypairFromJSON,
  loadKeypairFromBase58,
  exportKeypairToJSON,
  exportKeypairToBase58,
  generateKeypair,

  // Validators (useful for building on top of Legion)
  validateFeeConfig,
  validateWallet,
};
