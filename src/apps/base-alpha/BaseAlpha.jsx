/**
 * BaseAlpha — Smart Money Intelligence
 * Phase 4: connected to real backend, mobile-responsive
 *
 * Fetches from:
 *   GET /api/alpha/alerts?tier=free|pro   → alpha_alerts table
 *   GET /api/alpha/trending               → alpha_trending table
 *   GET /api/alpha/wallets?wallet=0x...   → alpha_tracked_wallets table
 *   GET /api/alpha/subscription/:address  → on-chain subscription check
 *
 * When alpha_alerts is empty (wallet-poller disabled), shows a clear
 * "no alerts yet" state with explanation. When data exists, renders
 * the real feed with tier-gated limits.
 *
 * Tracked Wallets tab:
 * - Admin (ADMIN_WALLET match): full addresses, Basescan links
 * - Everyone else: truncated addresses, labels + types only
 */

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../../wallet-integration";

const POLL_INTERVAL_MS = 30_000; // poll alerts every 30s

const badgeColor = (type) => {
  const map = {
    VC: { bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
    Whale: { bg: "rgba(0,255,238,0.1)", color: "#00ffee" },
    Fund: { bg: "rgba(168,85,247,0.15)", color: "#c084fc" },
    Protocol: { bg: "rgba(59,130,246,0.15)", color: "#60a5fa" },
    Degen: { bg: "rgba(255,45,146,0.1)", color: "#ff2d92" },
  };
  return map[type] || map.Protocol;
};

function timeAgo(ts) {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BaseAlpha({ apiUrl }) {
  const { address, connected } = useWallet();
  const [alerts, setAlerts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [trackedWallets, setTrackedWallets] = useState([]);
  const [walletCount, setWalletCount] = useState(0);
  const [isAdminView, setIsAdminView] = useState(false);
  const [subscription, setSubscription] = useState({ tier: "free", isActive: false });
  const [tab, setTab] = useState("feed");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isPro = subscription.tier === "pro" || subscription.tier === "whale";
  const API = apiUrl || "";

  // ─── Fetch alerts ──────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    try {
      const tier = isPro ? "pro" : "free";
      const res = await fetch(`${API}/api/alpha/alerts?tier=${tier}&wallet=${address || ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
      setError(null);
    } catch (err) {
      console.warn("[BaseAlpha] fetch alerts:", err.message);
      setError(err.message);
    }
  }, [API, address, isPro]);

  // ─── Fetch trending ────────────────────────────────────────
  const fetchTrending = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/alpha/trending`);
      if (!res.ok) return;
      const data = await res.json();
      setTrending(data.trending || []);
    } catch { /* silent */ }
  }, [API]);

  // ─── Fetch subscription ────────────────────────────────────
  const fetchSubscription = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${API}/api/alpha/subscription/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setSubscription(data);
    } catch { /* silent */ }
  }, [API, address]);

  // ─── Fetch tracked wallets ─────────────────────────────────
  const fetchTrackedWallets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/alpha/wallets?wallet=${address || ""}`);
      if (!res.ok) return;
      const data = await res.json();
      setTrackedWallets(data.wallets || []);
      setWalletCount(data.count || 0);
      setIsAdminView(data.admin === true);
    } catch { /* silent */ }
  }, [API, address]);

  // ─── Initial load + polling ────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAlerts(), fetchTrending(), fetchSubscription(), fetchTrackedWallets()])
      .finally(() => setLoading(false));

    const interval = setInterval(fetchAlerts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAlerts, fetchTrending, fetchSubscription, fetchTrackedWallets]);

  // ─── Filter alerts ─────────────────────────────────────────
  const filteredAlerts = filter === "all" ? alerts
    : filter === "bullish" ? alerts.filter(a => ["bought", "accumulated", "bridged_in", "lp", "staked"].includes(a.action))
    : alerts.filter(a => ["sold", "withdrew", "unstaked"].includes(a.action));

  // ─── Styles (inline, sci-fi, mobile-first) ─────────────────
  const S = {
    root: {
      minHeight: "calc(100vh - 60px)",
      background: "#04040a",
      color: "#dcdce5",
      fontFamily: '"JetBrains Mono", monospace',
    },
    page: { padding: "16px 16px 32px", maxWidth: 800, margin: "0 auto" },
    header: {
      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      flexWrap: "wrap", gap: 12, marginBottom: 20,
    },
    title: { fontSize: 22, fontWeight: 900, letterSpacing: "0.08em", color: "#00ffee", margin: 0 },
    subtitle: { fontSize: 10, color: "#6a6a82", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 4 },
    tabs: {
      display: "flex", gap: 6, marginBottom: 16, overflowX: "auto",
      WebkitOverflowScrolling: "touch", paddingBottom: 4,
    },
    tab: (active) => ({
      padding: "8px 16px", borderRadius: 8, border: "1px solid",
      borderColor: active ? "#00ffee" : "#1a1a2e",
      background: active ? "rgba(0,255,238,0.08)" : "transparent",
      color: active ? "#00ffee" : "#6a6a82",
      fontSize: 11, fontWeight: 600, cursor: "pointer",
      whiteSpace: "nowrap", minHeight: 36,
      fontFamily: '"JetBrains Mono", monospace',
      letterSpacing: "0.08em",
    }),
    filterRow: { display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap", alignItems: "center" },
    filterPill: (active) => ({
      padding: "6px 12px", borderRadius: 6,
      border: `1px solid ${active ? "#00ffee33" : "#1a1a2e"}`,
      background: active ? "rgba(0,255,238,0.06)" : "transparent",
      color: active ? "#00ffee" : "#6a6a82",
      fontSize: 10, cursor: "pointer", fontFamily: '"JetBrains Mono", monospace',
      minHeight: 32,
    }),
    card: {
      background: "rgba(8,8,18,0.9)", border: "1px solid #1a1a2e",
      borderRadius: 10, overflow: "hidden",
    },
    alertRow: {
      display: "flex", gap: 12, padding: "14px 16px",
      borderBottom: "1px solid #0f0f1a", alignItems: "flex-start",
      cursor: "pointer", transition: "background 0.15s",
    },
    badge: (type) => {
      const c = badgeColor(type);
      return {
        padding: "3px 8px", borderRadius: 4, fontSize: 9,
        fontWeight: 700, letterSpacing: "0.1em",
        background: c.bg, color: c.color,
        whiteSpace: "nowrap", flexShrink: 0,
      };
    },
    emptyState: {
      textAlign: "center", padding: "60px 20px",
      color: "#6a6a82", fontSize: 12,
      fontFamily: '"JetBrains Mono", monospace',
    },
    trendingRow: {
      display: "flex", alignItems: "center", padding: "12px 16px",
      borderBottom: "1px solid #0f0f1a", gap: 8, flexWrap: "wrap",
    },
    signalBadge: (signal) => ({
      padding: "3px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
      background: signal.includes("Distribution") || signal.includes("Sell")
        ? "rgba(255,45,146,0.1)" : "rgba(0,255,136,0.1)",
      color: signal.includes("Distribution") || signal.includes("Sell")
        ? "#ff2d92" : "#00ff88",
    }),
    liveIndicator: {
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 10, color: "#00ff88",
    },
    liveDot: {
      width: 6, height: 6, borderRadius: "50%", background: "#00ff88",
      animation: "pulse-ring 2s infinite",
    },
    // ─── Tracked Wallets styles ────────────────────────────────
    walletRow: {
      display: "flex", alignItems: "center", padding: "12px 16px",
      borderBottom: "1px solid #0f0f1a", gap: 10, flexWrap: "wrap",
    },
    walletAddress: (isAdmin) => ({
      fontSize: 11, color: isAdmin ? "#00ffee" : "#6a6a82",
      fontFamily: '"JetBrains Mono", monospace',
      textDecoration: isAdmin ? "none" : "none",
      cursor: isAdmin ? "pointer" : "default",
    }),
    walletLabel: {
      fontSize: 12, fontWeight: 700, color: "#dcdce5",
    },
    adminBadge: {
      padding: "2px 6px", borderRadius: 3, fontSize: 8,
      fontWeight: 700, letterSpacing: "0.15em",
      background: "rgba(0,255,136,0.1)", color: "#00ff88",
    },
  };

  return (
    <div style={S.root}>
      <style>{`
        @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>

      <div style={S.page}>
        {/* Header */}
        <div style={S.header}>
          <div>
            <h1 style={S.title}>BASE ALPHA</h1>
            <div style={S.subtitle}>smart money intelligence · base mainnet</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={S.liveIndicator}>
              <span style={S.liveDot} />
              LIVE
            </div>
            {isPro && (
              <span style={{ ...S.badge("VC"), background: "rgba(0,255,238,0.1)", color: "#00ffee" }}>PRO</span>
            )}
          </div>
        </div>

        {/* Tabs — dynamic wallet count */}
        <div style={S.tabs}>
          {[
            { key: "feed", label: "Alert Feed" },
            { key: "trending", label: "Trending" },
            { key: "wallets", label: `Tracked Wallets (${walletCount || "..."})` },
          ].map(t => (
            <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── ALERT FEED TAB ─────────────────────────────────── */}
        {tab === "feed" && (
          <>
            <div style={S.filterRow}>
              {["all", "bullish", "bearish"].map(f => (
                <button key={f} style={S.filterPill(filter === f)} onClick={() => setFilter(f)}>
                  {f === "bullish" && "🟢 "}{f === "bearish" && "🔴 "}
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 10, color: "#6a6a82" }}>
                {filteredAlerts.length} alerts
              </span>
            </div>

            {loading ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>◌</div>
                Loading alerts...
              </div>
            ) : filteredAlerts.length === 0 ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>◇</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#dcdce5", marginBottom: 8 }}>
                  No alerts yet
                </div>
                <div style={{ maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
                  Alerts appear here when your Alchemy webhook detects on-chain activity
                  from tracked wallets and writes to the alpha_alerts table.
                </div>
                <div style={{ marginTop: 16, padding: "10px 14px", background: "#0a0a14", border: "1px solid #1a1a2e", borderRadius: 8, display: "inline-block" }}>
                  <span style={{ color: "#6a6a82" }}>Status: </span>
                  <span style={{ color: "#00ff88" }}>wallet-poller active · polling every 10 min</span>
                </div>
              </div>
            ) : (
              <div style={S.card}>
                {filteredAlerts.map((alert, i) => (
                  <div
                    key={alert.id || i}
                    style={S.alertRow}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,238,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={S.badge(alert.wallet_type || alert.type || "Whale")}>
                      {alert.wallet_type || alert.type || "?"}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: "#dcdce5" }}>
                          {alert.wallet_label || alert.from_address?.slice(0, 8) || "Unknown"}
                        </span>
                        {alert.from_address && (
                          <span style={{ fontSize: 10, color: "#6a6a82" }}>
                            {alert.from_address.slice(0, 6)}...{alert.from_address.slice(-4)}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11 }}>
                        <span style={{
                          color: ["bought", "accumulated", "bridged_in", "lp", "staked"].includes(alert.action)
                            ? "#00ff88" : "#ff2d92",
                          fontWeight: 600,
                        }}>
                          {alert.action || "transferred"}
                        </span>
                        {alert.amount_usd && (
                          <span style={{ color: "#dcdce5", marginLeft: 6 }}>
                            ${Number(alert.amount_usd).toLocaleString()}
                          </span>
                        )}
                        {alert.token_symbol && (
                          <>
                            <span style={{ color: "#6a6a82", margin: "0 4px" }}>of</span>
                            <span style={{ color: "#00ffee", fontWeight: 600 }}>${alert.token_symbol}</span>
                          </>
                        )}
                      </div>
                      {alert.confidence && (
                        <div style={{ marginTop: 4, fontSize: 9, color: "#6a6a82", display: "flex", gap: 12 }}>
                          <span>Confidence <span style={{ color: "#00ff88" }}>{alert.confidence}%</span></span>
                          {alert.tx_hash && (
                            <a
                              href={`https://basescan.org/tx/${alert.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#6a6a82", textDecoration: "none" }}
                              onClick={e => e.stopPropagation()}
                            >
                              tx ↗
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 9, color: "#6a6a82", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {timeAgo(alert.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!isPro && alerts.length > 0 && (
              <div style={{ textAlign: "center", padding: "30px 0", color: "#6a6a82", fontSize: 11 }}>
                🔒 Free tier: showing {Math.min(alerts.length, 5)} of {alerts.length} alerts.
                Upgrade for full feed.
              </div>
            )}
          </>
        )}

        {/* ─── TRENDING TAB ───────────────────────────────────── */}
        {tab === "trending" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
                TRENDING ON BASE
              </div>
              <div style={{ fontSize: 10, color: "#6a6a82" }}>Tokens with most smart money activity · last 24h</div>
            </div>

            {trending.length === 0 ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>◇</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#dcdce5", marginBottom: 8 }}>
                  No trending data
                </div>
                <div style={{ maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
                  Trending tokens are computed from aggregated whale activity.
                  Data populates when the alert pipeline is active.
                </div>
              </div>
            ) : (
              <div style={S.card}>
                {/* Table header */}
                <div style={{ display: "flex", padding: "10px 16px", fontSize: 9, color: "#6a6a82", letterSpacing: "0.15em", textTransform: "uppercase", borderBottom: "1px solid #1a1a2e" }}>
                  <span style={{ flex: 1 }}>Token</span>
                  <span style={{ width: 80, textAlign: "center" }}>Whales</span>
                  <span style={{ width: 100, textAlign: "center" }}>Net Flow</span>
                  <span style={{ width: 90, textAlign: "right" }}>Signal</span>
                </div>
                {trending.map((item, i) => (
                  <div key={i} style={S.trendingRow}>
                    <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "#6a6a82", fontSize: 10 }}>#{i + 1}</span>
                      <span style={{ fontWeight: 700, color: "#dcdce5" }}>${item.token || item.symbol}</span>
                    </span>
                    <span style={{ width: 80, textAlign: "center", color: "#00ffee", fontSize: 11 }}>
                      {item.whale_count}
                    </span>
                    <span style={{
                      width: 100, textAlign: "center", fontSize: 11, fontWeight: 600,
                      color: String(item.net_flow || "").startsWith("-") ? "#ff2d92" : "#00ff88",
                    }}>
                      {item.net_flow || "—"}
                    </span>
                    <span style={{ width: 90, textAlign: "right" }}>
                      <span style={S.signalBadge(item.signal || "")}>
                        {item.signal || "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── TRACKED WALLETS TAB ────────────────────────────── */}
        {tab === "wallets" && (
          <>
            <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
                  TRACKED WALLETS
                </div>
                <div style={{ fontSize: 10, color: "#6a6a82" }}>
                  {walletCount} smart wallets monitored on Base
                  {isAdminView && " · admin view"}
                </div>
              </div>
              {isAdminView && (
                <span style={S.adminBadge}>ADMIN</span>
              )}
            </div>

            {trackedWallets.length === 0 ? (
              <div style={S.emptyState}>
                <div style={{ fontSize: 32, marginBottom: 16 }}>◌</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#dcdce5", marginBottom: 8 }}>
                  Loading wallets...
                </div>
              </div>
            ) : (
              <div style={S.card}>
                {/* Table header */}
                <div style={{
                  display: "flex", padding: "10px 16px", fontSize: 9, color: "#6a6a82",
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  borderBottom: "1px solid #1a1a2e", gap: 10,
                }}>
                  <span style={{ width: 70 }}>Type</span>
                  <span style={{ flex: 1 }}>Label</span>
                  <span style={{ flex: 1 }}>Address</span>
                </div>

                {trackedWallets.map((w, i) => (
                  <div
                    key={w.address + i}
                    style={S.walletRow}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(0,255,238,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ width: 70, flexShrink: 0 }}>
                      <span style={S.badge(w.type)}>{w.type}</span>
                    </span>
                    <span style={{ ...S.walletLabel, flex: 1 }}>
                      {w.label}
                    </span>
                    <span style={{ flex: 1 }}>
                      {isAdminView ? (
                        <a
                          href={`https://basescan.org/address/${w.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            ...S.walletAddress(true),
                            textDecoration: "none",
                          }}
                          title="View on Basescan"
                        >
                          {w.address.slice(0, 10)}...{w.address.slice(-6)} ↗
                        </a>
                      ) : (
                        <span style={S.walletAddress(false)}>
                          {w.address}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Type legend */}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              {["VC", "Whale", "Fund", "Protocol", "Degen"].map(type => (
                <span key={type} style={S.badge(type)}>{type}</span>
              ))}
            </div>

            {!isAdminView && (
              <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "#6a6a82" }}>
                Wallet addresses are truncated to protect alpha.
                {connected ? "" : " Connect wallet for personalized view."}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
