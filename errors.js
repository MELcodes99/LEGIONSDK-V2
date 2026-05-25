"use strict";

const ErrorCodes = {
  INVALID_CONFIG: "INVALID_CONFIG",
  INVALID_WALLET: "INVALID_WALLET",
  INVALID_FEE_CONFIG: "INVALID_FEE_CONFIG",
  TRANSACTION_FAILED: "TRANSACTION_FAILED",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_KEYPAIR: "INVALID_KEYPAIR",
};

class LegionError extends Error {
  /**
   * @param {string} message
   * @param {string} code    - One of ErrorCodes
   * @param {Error}  [cause] - Underlying error
   */
  constructor(message, code = "UNKNOWN", cause = null) {
    super(message);
    this.name = "LegionError";
    this.code = code;
    this.cause = cause;
  }
}

module.exports = { LegionError, ErrorCodes };
