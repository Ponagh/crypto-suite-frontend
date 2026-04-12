import { useState, useEffect, useCallback, useRef } from "react";

const MOCK_WALLETS = [
  { label: "Paradigm", address: "0x1a2...f8e", type: "VC", color: "#00ff88" },
  { label: "a]6Labs", address: "0x3b4...d2c", type: "Fund", color: "#00d4ff" },
  { label: "Whale_0x7f", address: "0x7f8...a1b", type: "Whale", color: "#ff6b35" },
  { label: "DeFi_Chad", address: "0x9c2...e4f", type: "Degen", color: "#c084fc" },
  { label: "Coinbase_Ventures", address: "0x5d1...b3a", type: "VC", color: "#00ff88" },
  { label: "Morpho_Treasury", address: "0x2e7...c8d", type: "Protocol", color: "#fbbf24" },
  { label: "Base_OG_42", address: "0x8a3...f7e", type: "Whale", color: "#ff6b35" },
  { label: "Aero_Maxi", address: "0x4f9...d1c", type: "Degen", color: "#c084fc" },
];

const TOKENS = [
  { name: "AERO", price: 2.84, change: 12.4, mcap: "2.1B" },
  { name: "MORPHO", price: 4.12, change: 8.7, mcap: "1.4B" },
  { name: "BRETT", price: 0.18, change: -3.2, mcap: "890M" },
  { name: "DEGEN", price: 0.042, change: 34.1, mcap: "420M" },
  { name: "TOSHI", price: 0.0089, change: 5.6, mcap: "310M" },
  { name: "WELL", price: 0.087, change: -1.4, mcap: "245M" },
  { name: "USDbC", price: 1.00, change: 0.01, mcap: "890M" },
  { name: "cbETH", price: 3842, change: 2.1, mcap: "4.2B" },
];

const ACTIONS = ["bought", "accumulated", "sold", "bridged in", "LP'd", "staked"];
const AMOUNTS = ["$42K", "$128K", "$310K", "$890K", "$1.2M", "$2.4M", "$5.7M", "$12M"];

function generateAlert(id) {
  const wallet = MOCK_WALLETS[Math.floor(Math.random() * MOCK_WALLETS.length)];
  const token = TOKENS[Math.floor(Math.random() * TOKENS.length)];
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
  const isBullish = ["bought", "accumulated", "bridged in", "LP'd", "staked"].includes(action);
  const confidence = Math.floor(Math.random() * 30) + 70;
  const now = new Date();
  const minsAgo = Math.floor(Math.random() * 59);
  const time = minsAgo === 0 ? "just now" : `${minsAgo}m ago`;

  return {
    id,
    wallet,
    token,
    action,
    amount,
    isBullish,
    confidence,
    time,
    timestamp: Date.now() - minsAgo * 60000,
    smartScore: Math.floor(Math.random() * 40) + 60,
    followCount: Math.floor(Math.random() * 200) + 10,
  };
}

function generateAlerts(count) {
  return Array.from({ length: count }, (_, i) => generateAlert(i)).sort(
    (a, b) => b.timestamp - a.timestamp
  );
}

const TRENDING = [
  { token: "DEGEN", whale_count: 7, net_flow: "+$4.2M", signal: "Strong Buy" },
  { token: "AERO", whale_count: 5, net_flow: "+$2.8M", signal: "Accumulating" },
  { token: "MORPHO", whale_count: 4, net_flow: "+$1.6M", signal: "Bullish" },
  { token: "BRETT", whale_count: 3, net_flow: "-$890K", signal: "Distribution" },
  { token: "TOSHI", whale_count: 2, net_flow: "+$420K", signal: "Early Signal" },
];

export default function BaseAlpha() {
  const [alerts, setAlerts] = useState(() => generateAlerts(20));
  const [filter, setFilter] = useState("all");
  const [isPro, setIsPro] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [tab, setTab] = useState("feed");
  const [alertsViewed, setAlertsViewed] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [showNewAlert, setShowNewAlert] = useState(false);
  const feedRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const newAlert = generateAlert(Date.now());
      setAlerts((prev) => [newAlert, ...prev.slice(0, 49)]);
      setLiveCount((c) => c + 1);
      setShowNewAlert(true);
      setTimeout(() => setShowNewAlert(false), 2000);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleAlertClick = (alert) => {
    if (!isPro && alertsViewed >= 3) {
      setShowPaywall(true);
      return;
    }
    setAlertsViewed((v) => v + 1);
  };

  const filteredAlerts =
    filter === "all"
      ? alerts
      : alerts.filter((a) =>
          filter === "bullish" ? a.isBullish : !a.isBullish
        );

  const typeFilters = ["all", "bullish", "bearish"];

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        @keyframes slide-in {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes flash-border {
          0%, 100% { border-color: rgba(0,255,136,0.1); }
          50% { border-color: rgba(0,255,136,0.6); }
        }

        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        .alert-card {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .alert-card:hover {
          transform: translateX(4px);
          background: rgba(255,255,255,0.04) !important;
        }

        .tab-btn {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .tab-btn:hover {
          background: rgba(255,255,255,0.08);
        }

        .filter-chip {
          transition: all 0.15s ease;
          cursor: pointer;
        }
        .filter-chip:hover {
          background: rgba(255,255,255,0.1);
        }

        .cta-btn {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .cta-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(0,255,136,0.3);
        }

        .trending-row {
          transition: all 0.2s ease;
          cursor: pointer;
        }
        .trending-row:hover {
          background: rgba(255,255,255,0.03);
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* Scan line effect */}
      <div style={styles.scanLine} />

      {/* Background grid */}
      <div style={styles.gridBg} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoContainer}>
            <div style={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#00ff88" strokeWidth="2" />
                <path d="M8 12l3 3 5-6" stroke="#00ff88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 style={styles.logo}>BASE ALPHA</h1>
              <p style={styles.logoSub}>Smart Money Intelligence</p>
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.liveIndicator}>
            <div style={{
              ...styles.liveDot,
              animation: "pulse-glow 2s ease-in-out infinite",
            }} />
            <span style={styles.liveText}>LIVE</span>
            <span style={styles.liveCount}>{liveCount + 847} signals today</span>
          </div>
          {!isPro && (
            <button className="cta-btn" style={styles.upgradeBtn} onClick={() => setShowPaywall(true)}>
              GO PRO — $9.99/mo
            </button>
          )}
          {isPro && (
            <div style={styles.proBadge}>
              <span>⚡</span> PRO
            </div>
          )}
        </div>
      </header>

      {/* Ticker bar */}
      <div style={styles.tickerBar}>
        <div style={{ display: "flex", animation: "ticker 30s linear infinite", whiteSpace: "nowrap" }}>
          {[...TOKENS, ...TOKENS].map((t, i) => (
            <span key={i} style={styles.tickerItem}>
              <span style={{ color: "#8a8f98", marginRight: 4 }}>{t.name}</span>
              <span style={{ color: "#fff", marginRight: 4 }}>${t.price}</span>
              <span style={{ color: t.change >= 0 ? "#00ff88" : "#ff4d4d", marginRight: 20 }}>
                {t.change >= 0 ? "+" : ""}{t.change}%
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {["feed", "trending", "wallets"].map((t) => (
          <button
            key={t}
            className="tab-btn"
            style={{
              ...styles.tab,
              ...(tab === t ? styles.tabActive : {}),
            }}
            onClick={() => setTab(t)}
          >
            {t === "feed" && "⚡ "}
            {t === "trending" && "🔥 "}
            {t === "wallets" && "👁 "}
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "feed" && showNewAlert && (
              <span style={styles.newBadge}>NEW</span>
            )}
          </button>
        ))}
      </div>

      {/* Feed Tab */}
      {tab === "feed" && (
        <div style={styles.content}>
          {/* Filters */}
          <div style={styles.filterRow}>
            {typeFilters.map((f) => (
              <button
                key={f}
                className="filter-chip"
                style={{
                  ...styles.filterChip,
                  ...(filter === f ? styles.filterChipActive : {}),
                }}
                onClick={() => setFilter(f)}
              >
                {f === "bullish" && "🟢 "}
                {f === "bearish" && "🔴 "}
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <div style={styles.filterRight}>
              <span style={styles.alertCount}>{filteredAlerts.length} alerts</span>
            </div>
          </div>

          {/* Alert Feed */}
          <div ref={feedRef} style={styles.feed}>
            {filteredAlerts.slice(0, isPro ? 50 : 5).map((alert, idx) => (
              <div
                key={alert.id}
                className="alert-card"
                style={{
                  ...styles.alertCard,
                  animation: idx === 0 && showNewAlert ? "slide-in 0.3s ease" : "none",
                  borderLeft: `3px solid ${alert.isBullish ? "#00ff88" : "#ff4d4d"}`,
                }}
                onClick={() => handleAlertClick(alert)}
              >
                <div style={styles.alertHeader}>
                  <div style={styles.alertWallet}>
                    <span style={{
                      ...styles.walletBadge,
                      background: `${alert.wallet.color}18`,
                      color: alert.wallet.color,
                      border: `1px solid ${alert.wallet.color}40`,
                    }}>
                      {alert.wallet.type}
                    </span>
                    <span style={styles.walletName}>{alert.wallet.label}</span>
                    <span style={styles.walletAddr}>{alert.wallet.address}</span>
                  </div>
                  <span style={styles.alertTime}>{alert.time}</span>
                </div>

                <div style={styles.alertBody}>
                  <span style={{ color: alert.isBullish ? "#00ff88" : "#ff4d4d", fontWeight: 600 }}>
                    {alert.action}
                  </span>
                  <span style={styles.alertAmount}>{alert.amount}</span>
                  <span style={{ color: "#fff" }}>of</span>
                  <span style={styles.alertToken}>${alert.token.name}</span>
                </div>

                <div style={styles.alertFooter}>
                  <div style={styles.alertMeta}>
                    <span style={styles.metaItem}>
                      <span style={{ color: "#8a8f98" }}>Confidence</span>
                      <span style={{
                        color: alert.confidence > 85 ? "#00ff88" : alert.confidence > 70 ? "#fbbf24" : "#ff4d4d"
                      }}>{alert.confidence}%</span>
                    </span>
                    <span style={styles.metaItem}>
                      <span style={{ color: "#8a8f98" }}>Smart Score</span>
                      <span style={{ color: "#00d4ff" }}>{alert.smartScore}</span>
                    </span>
                    <span style={styles.metaItem}>
                      <span style={{ color: "#8a8f98" }}>Followers</span>
                      <span style={{ color: "#c084fc" }}>{alert.followCount}</span>
                    </span>
                  </div>
                  <button className="cta-btn" style={styles.copyTradeBtn}>
                    Copy Trade →
                  </button>
                </div>
              </div>
            ))}

            {!isPro && (
              <div style={styles.paywallOverlay}>
                <div style={styles.paywallCard}>
                  <div style={styles.lockIcon}>🔒</div>
                  <h3 style={styles.paywallTitle}>Unlock Unlimited Alerts</h3>
                  <p style={styles.paywallText}>
                    Free users see 5 alerts. Go Pro for unlimited real-time signals,
                    advanced filters, and one-click copy trading.
                  </p>
                  <button className="cta-btn" style={styles.paywallBtn} onClick={() => {setIsPro(true); setShowPaywall(false);}}>
                    Upgrade to Pro — $9.99/mo
                  </button>
                  <p style={styles.paywallNote}>7-day free trial • Cancel anytime</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trending Tab */}
      {tab === "trending" && (
        <div style={styles.content}>
          <h2 style={styles.sectionTitle}>
            <span style={{ color: "#ff6b35" }}>🔥</span> Trending on Base — Last 24h
          </h2>
          <p style={styles.sectionSub}>Tokens with the most smart money activity</p>

          <div style={styles.trendingTable}>
            <div style={styles.trendingHeader}>
              <span style={{ flex: 1 }}>Token</span>
              <span style={{ flex: 1, textAlign: "center" }}>Whale Count</span>
              <span style={{ flex: 1, textAlign: "center" }}>Net Flow</span>
              <span style={{ flex: 1, textAlign: "right" }}>Signal</span>
            </div>
            {TRENDING.map((item, idx) => (
              <div key={idx} className="trending-row" style={styles.trendingRow}>
                <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={styles.trendRank}>#{idx + 1}</span>
                  <span style={{ color: "#fff", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                    ${item.token}
                  </span>
                </span>
                <span style={{ flex: 1, textAlign: "center", color: "#00d4ff", fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.whale_count} whales
                </span>
                <span style={{
                  flex: 1,
                  textAlign: "center",
                  color: item.net_flow.startsWith("+") ? "#00ff88" : "#ff4d4d",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                }}>
                  {item.net_flow}
                </span>
                <span style={{
                  flex: 1,
                  textAlign: "right",
                }}>
                  <span style={{
                    ...styles.signalBadge,
                    background: item.signal === "Distribution" ? "rgba(255,77,77,0.15)" : "rgba(0,255,136,0.12)",
                    color: item.signal === "Distribution" ? "#ff4d4d" : "#00ff88",
                    border: `1px solid ${item.signal === "Distribution" ? "rgba(255,77,77,0.3)" : "rgba(0,255,136,0.3)"}`,
                  }}>
                    {item.signal}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wallets Tab */}
      {tab === "wallets" && (
        <div style={styles.content}>
          <h2 style={styles.sectionTitle}>
            <span>👁</span> Tracked Smart Wallets
          </h2>
          <p style={styles.sectionSub}>Elite wallets monitored in real-time on Base</p>

          <div style={styles.walletGrid}>
            {MOCK_WALLETS.map((w, idx) => (
              <div key={idx} style={{
                ...styles.walletCard,
                borderTop: `2px solid ${w.color}`,
              }}>
                <div style={styles.walletCardHeader}>
                  <span style={{
                    ...styles.walletBadge,
                    background: `${w.color}18`,
                    color: w.color,
                    border: `1px solid ${w.color}40`,
                  }}>
                    {w.type}
                  </span>
                  <span style={{ color: "#8a8f98", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                    {w.address}
                  </span>
                </div>
                <h3 style={styles.walletCardName}>{w.label}</h3>
                <div style={styles.walletCardStats}>
                  <div>
                    <span style={{ color: "#8a8f98", fontSize: 11 }}>Win Rate</span>
                    <span style={{ color: "#00ff88", fontWeight: 700, fontSize: 16 }}>
                      {Math.floor(Math.random() * 25) + 65}%
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#8a8f98", fontSize: 11 }}>30d PnL</span>
                    <span style={{ color: "#00ff88", fontWeight: 700, fontSize: 16 }}>
                      +${(Math.random() * 5 + 0.5).toFixed(1)}M
                    </span>
                  </div>
                  <div>
                    <span style={{ color: "#8a8f98", fontSize: 11 }}>Trades</span>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
                      {Math.floor(Math.random() * 200) + 40}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paywall Modal */}
      {showPaywall && (
        <div style={styles.modalOverlay} onClick={() => setShowPaywall(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setShowPaywall(false)}>✕</button>
            <div style={styles.modalIcon}>⚡</div>
            <h2 style={styles.modalTitle}>Base Alpha Pro</h2>
            <p style={styles.modalPrice}>
              <span style={{ fontSize: 48, fontWeight: 800, color: "#00ff88" }}>$9.99</span>
              <span style={{ color: "#8a8f98" }}>/month</span>
            </p>
            <div style={styles.modalFeatures}>
              {[
                "Unlimited real-time smart money alerts",
                "Advanced wallet & token filters",
                "One-click copy trading via Coinbase Wallet",
                "Custom alert rules & Telegram notifications",
                "API access for your own bots",
                "Priority signal latency (<2s)",
              ].map((f, i) => (
                <div key={i} style={styles.modalFeature}>
                  <span style={{ color: "#00ff88" }}>✓</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <button className="cta-btn" style={styles.modalCta} onClick={() => { setIsPro(true); setShowPaywall(false); }}>
              Start 7-Day Free Trial
            </button>
            <p style={{ color: "#8a8f98", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              No credit card required • Cancel anytime
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "#07080a",
    color: "#e4e4e7",
    fontFamily: "'Outfit', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  scanLine: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: "linear-gradient(90deg, transparent, rgba(0,255,136,0.15), transparent)",
    animation: "scan-line 8s linear infinite",
    pointerEvents: "none",
    zIndex: 100,
  },
  gridBg: {
    position: "fixed",
    inset: 0,
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)
    `,
    backgroundSize: "60px 60px",
    pointerEvents: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 10,
    backdropFilter: "blur(12px)",
    background: "rgba(7,8,10,0.8)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  logoContainer: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "rgba(0,255,136,0.08)",
    border: "1px solid rgba(0,255,136,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: 3,
    color: "#00ff88",
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1,
  },
  logoSub: {
    fontSize: 9,
    color: "#8a8f98",
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 16 },
  liveIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 6,
    background: "rgba(255,77,77,0.08)",
    border: "1px solid rgba(255,77,77,0.2)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#ff4d4d",
  },
  liveText: {
    fontSize: 10,
    fontWeight: 700,
    color: "#ff4d4d",
    letterSpacing: 2,
    fontFamily: "'JetBrains Mono', monospace",
  },
  liveCount: {
    fontSize: 10,
    color: "#8a8f98",
    fontFamily: "'JetBrains Mono', monospace",
  },
  upgradeBtn: {
    padding: "8px 16px",
    borderRadius: 6,
    background: "linear-gradient(135deg, #00ff88, #00cc6a)",
    color: "#07080a",
    fontWeight: 700,
    fontSize: 12,
    border: "none",
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono', monospace",
  },
  proBadge: {
    padding: "6px 14px",
    borderRadius: 6,
    background: "linear-gradient(135deg, rgba(0,255,136,0.15), rgba(0,212,255,0.15))",
    border: "1px solid rgba(0,255,136,0.3)",
    color: "#00ff88",
    fontWeight: 700,
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: "'JetBrains Mono', monospace",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  tickerBar: {
    overflow: "hidden",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    background: "rgba(0,0,0,0.3)",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },
  tickerItem: {
    display: "inline-flex",
    alignItems: "center",
  },
  tabBar: {
    display: "flex",
    gap: 4,
    padding: "12px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  tab: {
    padding: "8px 20px",
    borderRadius: 6,
    background: "transparent",
    color: "#8a8f98",
    border: "1px solid transparent",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Outfit', sans-serif",
    display: "flex",
    alignItems: "center",
    gap: 4,
    position: "relative",
  },
  tabActive: {
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  newBadge: {
    fontSize: 8,
    fontWeight: 700,
    color: "#07080a",
    background: "#00ff88",
    padding: "1px 5px",
    borderRadius: 3,
    marginLeft: 6,
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono', monospace",
  },
  content: {
    padding: "20px 24px",
    position: "relative",
    zIndex: 5,
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    padding: "6px 14px",
    borderRadius: 20,
    background: "rgba(255,255,255,0.04)",
    color: "#8a8f98",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
    fontFamily: "'Outfit', sans-serif",
  },
  filterChipActive: {
    background: "rgba(0,255,136,0.1)",
    color: "#00ff88",
    border: "1px solid rgba(0,255,136,0.3)",
  },
  filterRight: {
    marginLeft: "auto",
  },
  alertCount: {
    fontSize: 12,
    color: "#8a8f98",
    fontFamily: "'JetBrains Mono', monospace",
  },
  feed: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    position: "relative",
  },
  alertCard: {
    padding: "14px 16px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alertWallet: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  walletBadge: {
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 4,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "'JetBrains Mono', monospace",
  },
  walletName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
  },
  walletAddr: {
    fontSize: 11,
    color: "#8a8f98",
    fontFamily: "'JetBrains Mono', monospace",
  },
  alertTime: {
    fontSize: 11,
    color: "#8a8f98",
    fontFamily: "'JetBrains Mono', monospace",
  },
  alertBody: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
  },
  alertAmount: {
    color: "#fff",
    fontWeight: 700,
    fontSize: 16,
  },
  alertToken: {
    color: "#00d4ff",
    fontWeight: 700,
    fontSize: 16,
  },
  alertFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  alertMeta: {
    display: "flex",
    gap: 16,
  },
  metaItem: {
    display: "flex",
    flexDirection: "column",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    gap: 2,
  },
  copyTradeBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    background: "rgba(0,255,136,0.1)",
    color: "#00ff88",
    border: "1px solid rgba(0,255,136,0.2)",
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: 1,
  },
  paywallOverlay: {
    padding: "40px 20px",
    display: "flex",
    justifyContent: "center",
  },
  paywallCard: {
    textAlign: "center",
    maxWidth: 400,
  },
  lockIcon: { fontSize: 36, marginBottom: 12 },
  paywallTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 8,
    fontFamily: "'Outfit', sans-serif",
  },
  paywallText: {
    fontSize: 13,
    color: "#8a8f98",
    marginBottom: 20,
    lineHeight: 1.5,
  },
  paywallBtn: {
    padding: "12px 32px",
    borderRadius: 8,
    background: "linear-gradient(135deg, #00ff88, #00cc6a)",
    color: "#07080a",
    fontWeight: 700,
    fontSize: 14,
    border: "none",
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono', monospace",
    width: "100%",
    marginBottom: 8,
  },
  paywallNote: {
    fontSize: 11,
    color: "#8a8f98",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: "#8a8f98",
    marginBottom: 20,
  },
  trendingTable: {
    display: "flex",
    flexDirection: "column",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  trendingHeader: {
    display: "flex",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.03)",
    fontSize: 11,
    color: "#8a8f98",
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  trendingRow: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    borderTop: "1px solid rgba(255,255,255,0.04)",
  },
  trendRank: {
    fontSize: 12,
    color: "#8a8f98",
    fontFamily: "'JetBrains Mono', monospace",
    width: 28,
  },
  signalBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  walletGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 12,
  },
  walletCard: {
    padding: "16px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  walletCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  walletCardName: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
  },
  walletCardStats: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 4,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.8)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#0d0f13",
    border: "1px solid rgba(0,255,136,0.15)",
    borderRadius: 16,
    padding: "36px 32px",
    maxWidth: 420,
    width: "100%",
    position: "relative",
  },
  modalClose: {
    position: "absolute",
    top: 12,
    right: 16,
    background: "none",
    border: "none",
    color: "#8a8f98",
    fontSize: 18,
    cursor: "pointer",
  },
  modalIcon: { fontSize: 40, textAlign: "center", marginBottom: 12 },
  modalTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: "#fff",
    textAlign: "center",
    marginBottom: 4,
    fontFamily: "'Outfit', sans-serif",
  },
  modalPrice: {
    textAlign: "center",
    marginBottom: 24,
    fontFamily: "'JetBrains Mono', monospace",
  },
  modalFeatures: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginBottom: 24,
  },
  modalFeature: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "#e4e4e7",
  },
  modalCta: {
    width: "100%",
    padding: "14px",
    borderRadius: 10,
    background: "linear-gradient(135deg, #00ff88, #00cc6a)",
    color: "#07080a",
    fontWeight: 800,
    fontSize: 15,
    border: "none",
    letterSpacing: 1,
    fontFamily: "'JetBrains Mono', monospace",
  },
};
