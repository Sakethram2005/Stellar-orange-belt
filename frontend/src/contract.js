import * as StellarSdk from "@stellar/stellar-sdk";
import { signTx } from "./wallets";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL, HORIZON_URL } from "./stellarConfig";

const rpc = new StellarSdk.rpc.Server(RPC_URL);
const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

const SIM_SOURCE = "GDB54GMX5MI5X5ETVUWPKY6JJMOHRT4KK2WM5ECR57WLPYYYN6ZCE37L";

const scString = (s) => StellarSdk.nativeToScVal(String(s), { type: "string" });
const scU64 = (n) =>
  StellarSdk.xdr.ScVal.scvU64(StellarSdk.xdr.Uint64.fromString(String(Math.floor(Number(n)))));
const scAddress = (addr) => new StellarSdk.Address(addr).toScVal();

const buildTx = async (sourceAddress, method, args = []) => {
  const account = await horizon.loadAccount(sourceAddress);
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(180)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error("Simulation error: " + sim.error);
  }

  return { assembled: StellarSdk.rpc.assembleTransaction(tx, sim).build(), sim };
};

const submitAndPoll = async (signedXdr) => {
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await rpc.sendTransaction(signedTx);
  if (result.status === "ERROR") throw new Error("Submit failed: " + result.errorResult);

  const hash = result.hash;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await rpc.getTransaction(hash);
    if (poll.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) return { hash };
    if (poll.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("TX failed on-chain: " + hash);
    }
  }
  throw new Error("TX timed out: " + hash);
};

const simulateRead = async (method, args = []) => {
  const account = await horizon.loadAccount(SIM_SOURCE);
  const contract = new StellarSdk.Contract(CONTRACT_ID);
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error("Read simulation error: " + sim.error);
  }
  return sim.result?.retval;
};

const parseAuction = (scVal) => {
  if (!scVal) return null;

  const entries = scVal.map?.() || scVal._value || [];
  const obj = {};

  for (const entry of entries) {
    const k = entry.key ? entry.key() : entry._attributes?.key?.();
    const v = entry.val ? entry.val() : entry._attributes?.val?.();
    if (!k || !v) continue;

    let keyName = null;
    if (k.sym) {
      const s = k.sym();
      keyName = s && s.toString ? s.toString() : null;
    } else if (k.str) {
      const s = k.str();
      keyName = s && s.toString ? s.toString() : null;
    }

    if (!keyName) continue;

    switch (keyName) {
      case "id":
      case "highest_bid":
      case "created_at": {
        const u = v.u64 ? v.u64() : null;
        obj[keyName] = u != null ? Number(u) : 0;
        break;
      }
      case "title":
      case "description": {
        const s = v.str ? v.str() : null;
        obj[keyName] = s && s.toString ? s.toString() : "";
        break;
      }
      case "seller": {
        const addrVal = v.address ? v.address() : v;
        console.log("parseAuction seller raw:", addrVal);

        let sellerStr = "";

        if (typeof addrVal === "string") {
          sellerStr = addrVal;
        } else if (addrVal && typeof addrVal === "object") {
          if (typeof addrVal.accountId === "string") {
            sellerStr = addrVal.accountId;          // <— use this
          } else if (typeof addrVal.value === "string") {
            sellerStr = addrVal.value;
          } else if (typeof addrVal.publicKey === "string") {
            sellerStr = addrVal.publicKey;
          } else {
            const vals = Object.values(addrVal);
            const firstStr = vals.find((v) => typeof v === "string");
            if (firstStr) {
              sellerStr = firstStr;
            } else if (addrVal.toString) {
              sellerStr = addrVal.toString();
            }
          }
        } else if (addrVal && addrVal.toString) {
          sellerStr = addrVal.toString();
        }

        obj.seller = sellerStr;
        break;
      }
      case "highest_bidder": {
        // Option<Address>
        const some = v.some ? v.some() : null;
        if (some) {
          const inner = some.address ? some.address() : some;
          if (typeof inner === "string") {
            obj.highest_bidder = inner;
          } else if (inner && inner.toString) {
            obj.highest_bidder = inner.toString();
          } else {
            obj.highest_bidder = null;
          }
        } else {
          obj.highest_bidder = null;
        }
        break;
      }
      case "is_active": {
        obj.is_active = v.b ? v.b() : false;
        break;
      }
      default:
        break;
    }
  }

  return {
    id: obj.id ?? 0,
    title: obj.title ?? "",
    description: obj.description ?? "",
    seller: obj.seller ?? "",
    highest_bid: obj.highest_bid ?? 0,
    highest_bidder: obj.highest_bidder ?? null,
    is_active: obj.is_active ?? false,
    created_at: obj.created_at ?? 0,
  };
};

export const getAuctions = async () => {
  try {
    const retval = await simulateRead("get_auctions");
    const vec = retval?.vec?.() ?? retval?._value ?? [];
    console.log("getAuctions RAW vec length:", vec.length);

    const parsed = vec.map(parseAuction).filter(Boolean);
    console.log("getAuctions parsed auctions:", parsed);
    return parsed;
  } catch (e) {
    console.error("getAuctions error:", e);
    return [];
  }
};

export const getAuctionCount = async () => {
  try {
    const retval = await simulateRead("get_count");
    return Number(retval?.u64?.() ?? 0);
  } catch {
    return 0;
  }
};

export const createAuction = async (seller, title, description) => {
  if (!seller) {
    const err = new Error("Wallet not connected.");
    err.type = "wallet_not_found";
    throw err;
  }

  const account = await horizon.loadAccount(seller).catch(() => null);
  if (!account) {
    const err = new Error("Account not found. Fund it via Friendbot.");
    err.type = "wallet_not_found";
    throw err;
  }

  const xlm = parseFloat(account.balances.find((b) => b.asset_type === "native")?.balance ?? "0");
  if (xlm < 1) {
    const err = new Error(`Insufficient balance: ${xlm.toFixed(2)} XLM. Need at least 1 XLM.`);
    err.type = "insufficient_balance";
    throw err;
  }

  const { assembled } = await buildTx(seller, "create_auction", [
    scAddress(seller),
    scString(title),
    scString(description),
  ]);

  const signedXdr = await signTx(assembled.toXDR(), seller);
  return submitAndPoll(signedXdr);
};

export const placeBid = async (bidder, auctionId, amount) => {
  if (!bidder) {
    const err = new Error("Wallet not connected.");
    err.type = "wallet_not_found";
    throw err;
  }

  if (!amount || Number(amount) <= 0) {
    const err = new Error("Bid amount must be greater than zero.");
    err.type = "invalid_input";
    throw err;
  }

  const account = await horizon.loadAccount(bidder).catch(() => null);
  const xlm = parseFloat(account?.balances.find((b) => b.asset_type === "native")?.balance ?? "0");
  if (xlm < 1) {
    const err = new Error(`Insufficient balance: ${xlm.toFixed(2)} XLM.`);
    err.type = "insufficient_balance";
    throw err;
  }

  const { assembled } = await buildTx(bidder, "place_bid", [
    scU64(auctionId),
    scAddress(bidder),
    scU64(amount),
  ]);

  const signedXdr = await signTx(assembled.toXDR(), bidder);
  return submitAndPoll(signedXdr);
};

export const endAuction = async (caller, auctionId) => {
  if (!caller) {
    const err = new Error("Wallet not connected.");
    err.type = "wallet_not_found";
    throw err;
  }

  const { assembled } = await buildTx(caller, "end_auction", [
    scAddress(caller),
    scU64(auctionId),
  ]);

  const signedXdr = await signTx(assembled.toXDR(), caller);
  return submitAndPoll(signedXdr);
};

export const subscribeToEvents = (onEvent) => {
  let stopped = false;
  let lastLedger = null;

  const poll = async () => {
    if (stopped) return;
    try {
      const latest = await rpc.getLatestLedger();
      const start = lastLedger ? lastLedger + 1 : latest.sequence - 50;
      const events = await rpc.getEvents({
        startLedger: start,
        filters: [{ type: "contract", contractIds: [CONTRACT_ID] }],
        limit: 20,
      });
      lastLedger = latest.sequence;

      for (const ev of events.events ?? []) {
        const topic1 = ev.topic?.[0]?.sym?.() ?? "";
        const topic2 = ev.topic?.[1]?.sym?.() ?? "";
        if (topic1 === "auction") {
          onEvent({ type: topic2, ledger: ev.ledger, time: new Date().toLocaleTimeString() });
        }
      }
    } catch {}
    setTimeout(poll, 6000);
  };

  poll();
  return () => {
    stopped = true;
  };
};