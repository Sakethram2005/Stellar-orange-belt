// src/wallets.js
import {
  requestAccess,
  setAllowed,
  getAddress,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";
import { NETWORK_PASSPHRASE } from "./stellarConfig";

export const connectWallet = async () => {
  try {
    await requestAccess();
    await setAllowed();
    const { address } = await getAddress();
    if (!address) {
      const err = new Error("No address returned. Please unlock Freighter.");
      err.type = "wallet_not_found";
      throw err;
    }
    return address;
  } catch (e) {
    if (e.type) throw e;
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
      const err = new Error("Connection rejected in Freighter.");
      err.type = "user_rejected";
      throw err;
    }
    const err = new Error("Freighter not found. Please install it from freighter.app.");
    err.type = "wallet_not_found";
    throw err;
  }
};

export const signTx = async (xdr, address) => {
  try {
    const result = await freighterSign(xdr, {
      networkPassphrase: NETWORK_PASSPHRASE,
      address,
    });
    const signedXdr = result?.signedTxXdr ?? result;
    if (!signedXdr) {
      const err = new Error("Signing returned empty. Did you reject?");
      err.type = "user_rejected";
      throw err;
    }
    return signedXdr;
  } catch (e) {
    if (e.type) throw e;
    const msg = (e?.message || "").toLowerCase();
    if (msg.includes("reject") || msg.includes("denied") || msg.includes("cancel")) {
      const err = new Error("Transaction rejected in Freighter.");
      err.type = "user_rejected";
      throw err;
    }
    throw e;
  }
};

export const disconnectWallet = () => true;
