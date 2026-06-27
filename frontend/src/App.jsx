import { useEffect, useState, useCallback } from "react";
import { connectWallet, disconnectWallet } from "./wallets";
import {
  getAuctions,
  createAuction,
  placeBid,
  endAuction,
  subscribeToEvents,
} from "./contract";
import { CONTRACT_ID, EXPLORER_TX, EXPLORER_CONTRACT } from "./stellarConfig";

const short = (s) => (s ? `${s.slice(0, 6)}...${s.slice(-4)}` : "—");
const shortTx = (s) => (s ? `${s.slice(0, 14)}...${s.slice(-8)}` : "");

export default function App() {
  const [address, setAddress] = useState(() => localStorage.getItem("stellar_address") || "");
  const [auctions, setAuctions] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [auctionsLoading, setAuctionsLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("auctions");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bidModal, setBidModal] = useState(null);
  const [bidAmount, setBidAmount] = useState("");

  const addError = (type, msg) => {
    const labels = {
      wallet_not_found: "⛔ Wallet Not Found",
      user_rejected: "🚫 User Rejected",
      insufficient_balance: "💸 Insufficient Balance",
      invalid_input: "⚠️ Invalid Input",
    };
    setErrors((p) => [
      { id: Date.now(), label: labels[type] || "❌ Error", msg, time: new Date().toLocaleTimeString() },
      ...p.slice(0, 9),
    ]);
  };

  const loadAuctions = useCallback(async () => {
    setAuctionsLoading(true);
    try {
      const list = await getAuctions();
      setAuctions(list.reverse());
    } catch {
    } finally {
      setAuctionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuctions();
  }, [loadAuctions]);

  useEffect(() => {
    const cleanup = subscribeToEvents((ev) => {
      setEvents((p) => [ev, ...p.slice(0, 19)]);
      loadAuctions();
    });
    return cleanup;
  }, [loadAuctions]);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      localStorage.setItem("stellar_address", addr);
    } catch (e) {
      addError(e.type || "unknown", e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setAddress("");
    localStorage.removeItem("stellar_address");
    setTxHash("");
    setTxStatus("idle");
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      addError("invalid_input", "Title and description are required.");
      return;
    }
    setLoading(true);
    setTxStatus("pending");
    setTxHash("");
    try {
      const result = await createAuction(address, title.trim(), description.trim());
      setTxHash(result.hash);
      setTxStatus("success");
      setTitle("");
      setDescription("");
      await loadAuctions();
      setActiveTab("auctions");
    } catch (e) {
      addError(e.type || "unknown", e.message);
      setTxStatus("failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBid = async (e) => {
    e.preventDefault();
    if (!bidModal) return;
    setLoading(true);
    setTxStatus("pending");
    setTxHash("");
    try {
      const result = await placeBid(address, bidModal.auction.id, bidAmount);
      setTxHash(result.hash);
      setTxStatus("success");
      setBidModal(null);
      setBidAmount("");
      await loadAuctions();
    } catch (e) {
      addError(e.type || "unknown", e.message);
      setTxStatus("failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEnd = async (auctionId) => {
    if (!address) {
      addError("wallet_not_found", "Connect wallet first.");
      return;
    }
    setLoading(true);
    setTxStatus("pending");
    setTxHash("");
    try {
      const result = await endAuction(address, auctionId);
      setTxHash(result.hash);
      setTxStatus("success");
      await loadAuctions();
    } catch (e) {
      addError(e.type || "unknown", e.message);
      setTxStatus("failed");
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    idle: "#64748b",
    pending: "#f59e0b",
    success: "#22c55e",
    failed: "#ef4444",
  };

  const statusTexts = {
    idle: "Idle",
    pending: "⏳ Pending…",
    success: "✅ Success",
    failed: "❌ Failed",
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">🏛️ NFT Auction House</span>
          <a
            href={`${EXPLORER_CONTRACT}/${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
            className="contract-badge"
          >
            {CONTRACT_ID.slice(0, 8)}…{CONTRACT_ID.slice(-4)}
          </a>
        </div>
        <div className="header-right">
          {address ? (
            <div className="wallet-connected">
              <span className="dot green" />
              <span className="wallet-addr">{short(address)}</span>
              <button className="btn btn-ghost btn-sm" onClick={handleDisconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={handleConnect} disabled={loading}>
              {loading ? "Connecting…" : "Connect Freighter"}
            </button>
          )}
        </div>
      </header>

      {txStatus !== "idle" && (
        <div className={`tx-bar tx-bar-${txStatus}`}>
          <span style={{ color: statusColors[txStatus], fontWeight: 600 }}>
            {statusTexts[txStatus]}
          </span>
          {txHash && (
            <a href={`${EXPLORER_TX}/${txHash}`} target="_blank" rel="noreferrer" className="tx-link">
              {shortTx(txHash)} ↗
            </a>
          )}
          <button className="btn-close" onClick={() => setTxStatus("idle")}>✕</button>
        </div>
      )}

      <div className="tabs">
        {["auctions", "create", "events"].map((t) => (
          <button
            key={t}
            className={`tab ${activeTab === t ? "tab-active" : ""}`}
            onClick={() => setActiveTab(t)}
          >
            {t === "auctions"
              ? `🖼 Auctions (${auctions.length})`
              : t === "create"
              ? "➕ Create"
              : `⚡ Live Events (${events.length})`}
          </button>
        ))}
      </div>

      <main className="main">
        {activeTab === "auctions" && (
          <div>
            <div className="section-header">
              <h2>All Auctions</h2>
              <button className="btn btn-ghost btn-sm" onClick={loadAuctions}>
                ↻ Refresh
              </button>
            </div>

            {auctionsLoading ? (
              <div className="loading-grid">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" />
                ))}
              </div>
            ) : auctions.length === 0 ? (
              <div className="empty">
                <p>No auctions yet.</p>
                <button className="btn btn-primary" onClick={() => setActiveTab("create")}>
                  Create First Auction
                </button>
              </div>
            ) : (
              <div className="auction-grid">
                {auctions.map((a, idx) => (
                  <div
                    key={`${a.id ?? "na"}-${a.seller ?? "na"}-${a.created_at ?? "na"}-${idx}`}
                    className={`auction-card ${!a.is_active ? "ended" : ""}`}
                  >
                    <div className="auction-card-header">
                      <span className="auction-id">#{a.id}</span>
                      <span className={`status-badge ${a.is_active ? "active" : "ended"}`}>
                        {a.is_active ? "🟢 Active" : "🔴 Ended"}
                      </span>
                    </div>
                    <h3 className="auction-title">{a.title}</h3>
                    <p className="auction-desc">{a.description}</p>
                    <div className="auction-meta">
                      <div>
                        <span className="meta-label">Top Bid</span>
                        <span className="meta-value bid-value">
                          {a.highest_bid > 0 ? a.highest_bid : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="meta-label">Top Bidder</span>
                        <span className="meta-value">{short(a.highest_bidder)}</span>
                      </div>
                      <div>
                        <span className="meta-label">Seller</span>
                        <span className="meta-value">{short(a.seller)}</span>
                      </div>
                    </div>
                    {a.is_active && (
                      <div className="auction-actions">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setBidModal({ auction: a });
                            setBidAmount("");
                          }}
                          disabled={!address || loading}
                        >
                          Place Bid
                        </button>
                        {address && a.seller === address && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleEnd(a.id)}
                            disabled={loading}
                          >
                            End Auction
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "create" && (
          <div className="form-container">
            <h2>Create New Auction</h2>
            {!address && (
              <div className="info-box">
                ⚠️ Connect your Freighter wallet to create an auction.
              </div>
            )}
            <form onSubmit={handleCreate} className="auction-form">
              <div className="field">
                <label>NFT Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cosmic Voyager #42"
                  disabled={loading || !address}
                  maxLength={80}
                />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your NFT..."
                  rows={4}
                  disabled={loading || !address}
                  maxLength={200}
                />
                <span className="char-count">{description.length}/200</span>
              </div>
              <button
                type="submit"
                className="btn btn-primary full-width"
                disabled={loading || !address}
              >
                {loading && txStatus === "pending" ? "Creating…" : "🚀 Create Auction"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "events" && (
          <div>
            <div className="section-header">
              <h2>Live Contract Events</h2>
              <span className="live-dot">● LIVE</span>
            </div>
            <p className="events-sub">
              Streaming real-time events from contract <code>{CONTRACT_ID.slice(0, 10)}…</code>
            </p>
            {events.length === 0 ? (
              <div className="empty">
                <p>No events yet. Interact with the contract to see live updates.</p>
              </div>
            ) : (
              <div className="event-feed">
                {events.map((ev, i) => (
                  <div
                    key={`${ev.ledger ?? "ledger"}-${ev.type ?? "type"}-${i}`}
                    className={`event-item event-${ev.type}`}
                  >
                    <span className="event-icon">
                      {ev.type === "created" ? "🆕" : ev.type === "bid" ? "💰" : ev.type === "ended" ? "🏁" : "📡"}
                    </span>
                    <div className="event-body">
                      <span className="event-type">auction.{ev.type}</span>
                      <span className="event-meta">
                        Ledger #{ev.ledger} · {ev.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <div className="error-log">
            <div className="error-log-header">
              <h3>Error Log</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setErrors([])}>
                Clear
              </button>
            </div>
            {errors.map((err) => (
              <div key={err.id} className="error-item">
                <strong className="error-label">{err.label}</strong>
                <span className="error-time">{err.time}</span>
                <p className="error-msg">{err.msg}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {bidModal && (
        <div className="modal-overlay" onClick={() => setBidModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Place Bid</h3>
              <button className="btn-close" onClick={() => setBidModal(null)}>
                ✕
              </button>
            </div>
            <p className="modal-subtitle">
              <strong>{bidModal.auction.title}</strong>
            </p>
            <p className="modal-current">
              Current highest: <strong>{bidModal.auction.highest_bid || 0}</strong>
            </p>
            <form onSubmit={handleBid}>
              <div className="field">
                <label>Your Bid Amount</label>
                <input
                  type="number"
                  min={bidModal.auction.highest_bid + 1}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  placeholder={`> ${bidModal.auction.highest_bid}`}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary full-width"
                disabled={loading}
              >
                {loading && txStatus === "pending" ? "Submitting…" : "Submit Bid"}
              </button>
            </form>
          </div>
        </div>
      )}

      <footer className="footer">
        Built on <a href="https://stellar.org" target="_blank" rel="noreferrer">Stellar</a> Testnet · Soroban Smart Contract · Orange Belt Level 3
      </footer>
    </div>
  );
}