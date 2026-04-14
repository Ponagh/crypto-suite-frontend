import { useState, useEffect, useRef } from "react";

const MOCK_WALLETS = [
  { label: "Paradigm", address: "0x1a2...f8e", type: "VC" },
  { label: "a16Labs", address: "0x3b4...d2c", type: "Fund" },
  { label: "Whale_0x7f", address: "0x7f8...a1b", type: "Whale" },
  { label: "DeFi_Chad", address: "0x9c2...e4f", type: "Degen" },
  { label: "Coinbase_Ventures", address: "0x5d1...b3a", type: "VC" },
  { label: "Morpho_Treasury", address: "0x2e7...c8d", type: "Protocol" },
  { label: "Base_OG_42", address: "0x8a3...f7e", type: "Whale" },
  { label: "Aero_Maxi", address: "0x4f9...d1c", type: "Degen" },
];

const TOKENS = [
  { name: "AERO", price: 2.84, change: 12.4 },
  { name: "MORPHO", price: 4.12, change: 8.7 },
  { name: "BRETT", price: 0.18, change: -3.2 },
  { name: "DEGEN", price: 0.042, change: 34.1 },
  { name: "TOSHI", price: 0.0089, change: 5.6 },
  { name: "WELL", price: 0.087, change: -1.4 },
  { name: "USDbC", price: 1.00, change: 0.01 },
  { name: "cbETH", price: 3842, change: 2.1 },
];

const ACTIONS = ["bought", "accumulated", "sold", "bridged in", "LP'd", "staked"];
const AMOUNTS = ["$42K", "$128K", "$310K", "$890K", "$1.2M", "$2.4M", "$5.7M", "$12M"];

const TRENDING = [
  { token: "DEGEN", whale_count: 7, net_flow: "+$4.2M", signal: "Strong Buy" },
  { token: "AERO", whale_count: 5, net_flow: "+$2.8M", signal: "Accumulating" },
  { token: "MORPHO", whale_count: 4, net_flow: "+$1.6M", signal: "Bullish" },
  { token: "BRETT", whale_count: 3, net_flow: "-$890K", signal: "Distribution" },
  { token: "TOSHI", whale_count: 2, net_flow: "+$420K", signal: "Early Signal" },
];

function generateAlert(id) {
  const wallet = MOCK_WALLETS[Math.floor(Math.random() * MOCK_WALLETS.length)];
  const token = TOKENS[Math.floor(Math.random() * TOKENS.length)];
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
  const isBullish = ["bought", "accumulated", "bridged in", "LP'd", "staked"].includes(action);
  const confidence = Math.floor(Math.random() * 30) + 70;
  const minsAgo = Math.floor(Math.random() * 59);
  const time = minsAgo === 0 ? "just now" : `${minsAgo}m ago`;
  return {
    id, wallet, token, action, amount, isBullish, confidence, time,
    timestamp: Date.now() - minsAgo * 60000,
    smartScore: Math.floor(Math.random() * 40) + 60,
    followCount: Math.floor(Math.random() * 200) + 10,
  };
}

function generateAlerts(count) {
  return Array.from({ length: count }, (_, i) => generateAlert(i)).sort((a, b) => b.timestamp - a.timestamp);
}

const badgeClass = (type) => {
  const map = { VC: "badge-vc", Whale: "badge-whale", Fund: "badge-fund", Protocol: "badge-protocol", Degen: "badge-degen" };
  return `badge ${map[type] || "badge-protocol"}`;
};

export default function BaseAlpha() {
  const [alerts, setAlerts] = useState(() => generateAlerts(20));
  const [filter, setFilter] = useState("all");
  const [isPro, setIsPro] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [tab, setTab] = useState("feed");
  const [alertsViewed, setAlertsViewed] = useState(0);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const newAlert = generateAlert(Date.now());
      setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
      setLiveCount((c) => c + 1);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleAlertClick = (alert) => {
    if (!isPro && alertsViewed >= 3) { setShowPaywall(true); return; }
    setAlertsViewed((v) => v + 1);
  };

  const filteredAlerts = filter === "all" ? alerts : alerts.filter((a) => filter === "bullish" ? a.isBullish : !a.isBullish);

  return (
    <div>
      {/* Ticker */}
      <div className="ticker-bar">
        <div className="ticker-track">
          {[...TOKENS, ...TOKENS].map((t, i) => (
            <span key={i} className="ticker-item">
              <span className="ticker-symbol">{t.name}</span>
              <span className="ticker-price">${t.price}</span>
              <span className={t.change >= 0 ? "ticker-up" : "ticker-down"}>
                {t.change >= 0 ? "+" : ""}{t.change}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="app-page">
        {/* Header */}
        <div className="app-header">
          <div className="app-title">
            <div className="app-title-icon" style={{ background: "var(--blue-bg)" }}>⚡</div>
            <div>
              <h1>Base Alpha</h1>
              <p>Smart Money Intelligence</p>
            </div>
          </div>
          <div className="app-header-right">
            <div className="live-badge">
              <span className="live-badge-dot" />
              <span style={{ color: "var(--text)" }}>{liveCount + 847}</span> signals today
            </div>
            {!isPro ? (
              <button className="btn-cta" onClick={() => setShowPaywall(true)}>
                Go Pro — $9.99/mo
              </button>
            ) : (
              <span className="badge" style={{ background: "var(--blue-bg)", color: "var(--blue)", padding: "6px 14px", fontSize: 12 }}>
                ⚡ PRO
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="filter-group" style={{ marginBottom: 24 }}>
          {["feed", "trending", "wallets"].map((t) => (
            <button key={t} className={`filter-pill ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t === "feed" && "⚡ "}{t === "trending" && "🔥 "}{t === "wallets" && "👁 "}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Feed Tab */}
        {tab === "feed" && (
          <>
            <div className="filter-group">
              {["all", "bullish", "bearish"].map((f) => (
                <button key={f} className={`filter-pill ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                  {f === "bullish" && "🟢 "}{f === "bearish" && "🔴 "}
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                {filteredAlerts.length} alerts
              </span>
            </div>

            <div className="feed-list">
              {filteredAlerts.slice(0, isPro ? 50 : 5).map((alert) => (
                <div key={alert.id} className="feed-item" onClick={() => handleAlertClick(alert)}>
                  <span className={badgeClass(alert.wallet.type)}>{alert.wallet.type}</span>
                  <div>
                    <div>
                      <span className="feed-wallet-name">{alert.wallet.label}</span>
                      <span className="feed-wallet-addr" style={{ marginLeft: 8 }}>{alert.wallet.address}</span>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className={`feed-action ${alert.isBullish ? "bullish" : "bearish"}`}>
                        {alert.action} {alert.amount}
                      </span>
                      <span style={{ color: "var(--text-dim)", margin: "0 6px" }}>of</span>
                      <span className="feed-token">${alert.token.name}</span>
                    </div>
                    <div className="feed-meta">
                      <span className="feed-meta-item">Confidence <span className="feed-meta-value">{alert.confidence}%</span></span>
                      <span className="feed-meta-item">Smart Score <span className="feed-meta-value" style={{ color: "var(--blue)" }}>{alert.smartScore}</span></span>
                      <span className="feed-meta-item">Followers <span className="feed-meta-value" style={{ color: "var(--purple)" }}>{alert.followCount}</span></span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <span className="feed-time">{alert.time}</span>
                    <a href="#" className="feed-cta">Copy Trade →</a>
                  </div>
                </div>
              ))}
            </div>

            {!isPro && (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <p style={{ color: "var(--text-dim)", marginBottom: 16, fontSize: 14 }}>
                  🔒 Free users see 5 alerts. Upgrade for unlimited signals.
                </p>
                <button className="btn-cta" onClick={() => { setIsPro(true); setShowPaywall(false); }}>
                  Upgrade to Pro — $9.99/mo
                </button>
                <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8 }}>7-day free trial • Cancel anytime</p>
              </div>
            )}
          </>
        )}

        {/* Trending Tab */}
        {tab === "trending" && (
          <>
            <div className="section-header">
              <h2 className="section-title">🔥 Trending on Base — Last 24h</h2>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>Tokens with the most smart money activity</p>
            <div className="card">
              <div className="card-header" style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 1 }}>
                <span style={{ flex: 1 }}>Token</span>
                <span style={{ flex: 1, textAlign: "center" }}>Whale Count</span>
                <span style={{ flex: 1, textAlign: "center" }}>Net Flow</span>
                <span style={{ flex: 1, textAlign: "right" }}>Signal</span>
              </div>
              {TRENDING.map((item, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 12 }}>#{idx + 1}</span>
                    <span style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>${item.token}</span>
                  </span>
                  <span style={{ flex: 1, textAlign: "center", color: "var(--blue)", fontFamily: "var(--mono)" }}>{item.whale_count} whales</span>
                  <span style={{ flex: 1, textAlign: "center", color: item.net_flow.startsWith("+") ? "var(--green)" : "var(--red)", fontFamily: "var(--mono)", fontWeight: 600 }}>
                    {item.net_flow}
                  </span>
                  <span style={{ flex: 1, textAlign: "right" }}>
                    <span className="badge" style={{
                      background: item.signal === "Distribution" ? "var(--red-bg)" : "var(--green-bg)",
                      color: item.signal === "Distribution" ? "var(--red)" : "var(--green)",
                    }}>
                      {item.signal}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Wallets Tab */}
        {tab === "wallets" && (
          <>
            <div className="section-header">
              <h2 className="section-title">👁 Tracked Smart Wallets</h2>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>Elite wallets monitored in real-time on Base</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {MOCK_WALLETS.map((w, idx) => (
                <div key={idx} className="card" style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span className={badgeClass(w.type)}>{w.type}</span>
                    <span style={{ color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: 11 }}>{w.address}</span>
                  </div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{w.label}</h3>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Win Rate</div>
                      <div style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--green)" }}>{Math.floor(Math.random() * 25) + 65}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>30d PnL</div>
                      <div style={{ fontFamily: "var(--mono)", fontWeight: 600, color: "var(--green)" }}>+${(Math.random() * 5 + 0.5).toFixed(1)}M</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Trades</div>
                      <div style={{ fontFamily: "var(--mono)", fontWeight: 600 }}>{Math.floor(Math.random() * 200) + 40}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Paywall Modal */}
      {showPaywall && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
          onClick={() => setShowPaywall(false)}>
          <div className="card" style={{ maxWidth: 420, width: "100%", padding: "36px 32px", position: "relative" }} onClick={(e) => e.stopPropagation()}>
            <button style={{ position: "absolute", top: 12, right: 16, background: "none", border: "none", color: "var(--text-dim)", fontSize: 18, cursor: "pointer" }} onClick={() => setShowPaywall(false)}>✕</button>
            <div style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}>⚡</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>Base Alpha Pro</h2>
            <p style={{ textAlign: "center", marginBottom: 24 }}>
              <span style={{ fontSize: 48, fontWeight: 700, color: "var(--blue)" }}>$9.99</span>
              <span style={{ color: "var(--text-dim)" }}>/month</span>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {[
                "Unlimited real-time smart money alerts",
                "Advanced wallet & token filters",
                "One-click copy trading via Coinbase Wallet",
                "Custom alert rules & Telegram notifications",
                "API access for your own bots",
                "Priority signal latency (<2s)",
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--text-secondary)" }}>
                  <span style={{ color: "var(--green)" }}>✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <button className="btn-cta" style={{ width: "100%" }} onClick={() => { setIsPro(true); setShowPaywall(false); }}>
              Start 7-Day Free Trial
            </button>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              No credit card required • Cancel anytime
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
