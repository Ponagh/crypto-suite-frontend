import { useState, useEffect, useRef } from "react";

const PROTOCOLS = [
  {
    name: "Morpho Blue",
    logo: "🔵",
    tvl: "$2.14B",
    audited: true,
    pools: [
      { asset: "USDC", apy: 8.42, risk: "Low", tvl: "$890M", utilization: 76, strategy: "Lending", trend: [6.2, 7.1, 7.8, 8.1, 8.4, 8.42], bonus: null },
      { asset: "ETH", apy: 4.18, risk: "Low", tvl: "$620M", utilization: 62, strategy: "Lending", trend: [3.1, 3.5, 3.8, 4.0, 4.1, 4.18], bonus: null },
      { asset: "cbETH", apy: 5.74, risk: "Low", tvl: "$340M", utilization: 58, strategy: "Lending + Staking", trend: [4.2, 4.8, 5.1, 5.4, 5.6, 5.74], bonus: "+1.2% staking" },
    ],
  },
  {
    name: "Aerodrome",
    logo: "✈️",
    tvl: "$1.82B",
    audited: true,
    pools: [
      { asset: "USDC/ETH", apy: 24.6, risk: "Medium", tvl: "$310M", utilization: 88, strategy: "LP + Emissions", trend: [18, 20, 22, 23, 24, 24.6], bonus: "+12% AERO" },
      { asset: "USDC/USDbC", apy: 6.12, risk: "Low", tvl: "$180M", utilization: 94, strategy: "Stable LP", trend: [5.1, 5.4, 5.8, 6.0, 6.1, 6.12], bonus: "+2% AERO" },
      { asset: "ETH/AERO", apy: 42.8, risk: "High", tvl: "$95M", utilization: 72, strategy: "Volatile LP", trend: [30, 35, 38, 40, 41, 42.8], bonus: "+28% AERO" },
    ],
  },
  {
    name: "Moonwell",
    logo: "🌙",
    tvl: "$420M",
    audited: true,
    pools: [
      { asset: "USDC", apy: 7.24, risk: "Low", tvl: "$210M", utilization: 71, strategy: "Lending", trend: [5.8, 6.1, 6.5, 6.8, 7.0, 7.24], bonus: "+0.8% WELL" },
      { asset: "ETH", apy: 3.86, risk: "Low", tvl: "$120M", utilization: 55, strategy: "Lending", trend: [2.9, 3.1, 3.4, 3.6, 3.8, 3.86], bonus: null },
      { asset: "DAI", apy: 6.94, risk: "Low", tvl: "$90M", utilization: 68, strategy: "Lending", trend: [5.2, 5.6, 6.0, 6.4, 6.7, 6.94], bonus: "+0.5% WELL" },
    ],
  },
  {
    name: "Extra Finance",
    logo: "💎",
    tvl: "$180M",
    audited: true,
    pools: [
      { asset: "USDC/ETH 3x", apy: 68.4, risk: "High", tvl: "$42M", utilization: 82, strategy: "Leveraged LP", trend: [45, 52, 58, 62, 65, 68.4], bonus: null },
      { asset: "ETH/cbETH 2x", apy: 18.9, risk: "Medium", tvl: "$35M", utilization: 74, strategy: "Leveraged LP", trend: [12, 14, 15, 16, 17, 18.9], bonus: null },
    ],
  },
  {
    name: "Seamless",
    logo: "🌊",
    tvl: "$290M",
    audited: true,
    pools: [
      { asset: "USDC", apy: 9.12, risk: "Low", tvl: "$145M", utilization: 78, strategy: "Lending", trend: [6.8, 7.2, 7.8, 8.4, 8.8, 9.12], bonus: "+1.5% SEAM" },
      { asset: "ETH", apy: 5.02, risk: "Low", tvl: "$95M", utilization: 61, strategy: "Lending", trend: [3.8, 4.1, 4.4, 4.6, 4.8, 5.02], bonus: "+0.8% SEAM" },
    ],
  },
];

function MiniChart({ data, color, width = 80, height = 28 }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#grad-${color.replace("#","")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RiskMeter({ level }) {
  const colors = { Low: "#22c55e", Medium: "#f59e0b", High: "#ef4444" };
  const widths = { Low: "33%", Medium: "66%", High: "100%" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 48,
        height: 4,
        borderRadius: 2,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        <div style={{
          width: widths[level],
          height: "100%",
          borderRadius: 2,
          background: colors[level],
          transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{ fontSize: 11, color: colors[level], fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
        {level}
      </span>
    </div>
  );
}

export default function YieldPilot() {
  const [sortBy, setSortBy] = useState("apy");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedPool, setSelectedPool] = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [showDeposit, setShowDeposit] = useState(false);
  const [portfolio, setPortfolio] = useState({
    totalDeposited: 12480,
    totalEarned: 847.32,
    avgApy: 11.4,
    positions: 4,
  });

  const allPools = PROTOCOLS.flatMap((p) =>
    p.pools.map((pool) => ({ ...pool, protocol: p.name, protocolLogo: p.logo, protocolTvl: p.tvl }))
  );

  const filteredPools = allPools
    .filter((p) => riskFilter === "all" || p.risk === riskFilter)
    .sort((a, b) => {
      if (sortBy === "apy") return b.apy - a.apy;
      if (sortBy === "tvl") return parseFloat(b.tvl.replace(/[\$M,B]/g, "")) - parseFloat(a.tvl.replace(/[\$M,B]/g, ""));
      if (sortBy === "risk") {
        const order = { Low: 0, Medium: 1, High: 2 };
        return order[a.risk] - order[b.risk];
      }
      return 0;
    });

  const aiRecommendation = filteredPools.find((p) => p.risk === "Low" && p.apy > 7) || filteredPools[0];

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes fade-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        .pool-row { transition: all 0.2s ease; cursor: pointer; }
        .pool-row:hover { background: rgba(255,255,255,0.03) !important; transform: translateY(-1px); }

        .sort-btn { transition: all 0.15s ease; cursor: pointer; }
        .sort-btn:hover { background: rgba(255,255,255,0.08); }

        .action-btn { transition: all 0.2s ease; cursor: pointer; }
        .action-btn:hover { transform: translateY(-1px); }

        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      {/* Ambient gradient */}
      <div style={styles.ambientGlow} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoBox}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#60a5fa" opacity="0.8" />
              <path d="M2 17l10 5 10-5" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
              <path d="M2 12l10 5 10-5" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
            </svg>
          </div>
          <div>
            <h1 style={styles.logo}>YieldPilot</h1>
            <p style={styles.logoSub}>AI-Optimized DeFi Yields on Base</p>
          </div>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.networkBadge}>
            <div style={styles.networkDot} />
            Base Mainnet
          </div>
        </div>
      </header>

      {/* Portfolio Summary */}
      <div style={styles.portfolioSection}>
        <div style={styles.portfolioGrid}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Total Deposited</span>
            <span style={styles.statValue}>${portfolio.totalDeposited.toLocaleString()}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Earnings (30d)</span>
            <span style={{ ...styles.statValue, color: "#22c55e" }}>+${portfolio.totalEarned.toFixed(2)}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Avg. APY</span>
            <span style={{ ...styles.statValue, color: "#60a5fa" }}>{portfolio.avgApy}%</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>Active Positions</span>
            <span style={styles.statValue}>{portfolio.positions}</span>
          </div>
        </div>
      </div>

      {/* AI Recommendation */}
      <div style={styles.aiCard}>
        <div style={styles.aiHeader}>
          <div style={styles.aiIcon}>
            <span style={{ fontSize: 18 }}>🧠</span>
          </div>
          <div>
            <h3 style={styles.aiTitle}>AI Recommendation</h3>
            <p style={styles.aiSub}>Best risk-adjusted yield right now</p>
          </div>
        </div>
        <div style={styles.aiBody}>
          <div style={styles.aiPool}>
            <span style={{ fontSize: 20 }}>{aiRecommendation.protocolLogo}</span>
            <div>
              <span style={styles.aiPoolName}>{aiRecommendation.asset} on {aiRecommendation.protocol}</span>
              <span style={styles.aiPoolStrategy}>{aiRecommendation.strategy}</span>
            </div>
          </div>
          <div style={styles.aiStats}>
            <div style={styles.aiStat}>
              <span style={{ fontSize: 28, fontWeight: 800, color: "#22c55e", fontFamily: "'DM Mono', monospace" }}>
                {aiRecommendation.apy}%
              </span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>APY</span>
            </div>
            <RiskMeter level={aiRecommendation.risk} />
          </div>
          <p style={styles.aiReason}>
            This pool offers the best risk-adjusted return on Base. High TVL ({aiRecommendation.tvl}),
            audited protocol, and consistent yield trend over 30 days. Utilization at {aiRecommendation.utilization}%
            indicates healthy demand.
          </p>
          <button
            className="action-btn"
            style={styles.aiDeposit}
            onClick={() => { setSelectedPool(aiRecommendation); setShowDeposit(true); }}
          >
            Deposit Now →
          </button>
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        <div style={styles.controlLeft}>
          <h2 style={styles.tableTitle}>All Opportunities</h2>
          <span style={styles.poolCount}>{filteredPools.length} pools</span>
        </div>
        <div style={styles.controlRight}>
          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Risk:</span>
            {["all", "Low", "Medium", "High"].map((r) => (
              <button
                key={r}
                className="sort-btn"
                style={{
                  ...styles.filterChip,
                  ...(riskFilter === r ? styles.filterActive : {}),
                }}
                onClick={() => setRiskFilter(r)}
              >
                {r === "all" ? "All" : r}
              </button>
            ))}
          </div>
          <div style={styles.filterGroup}>
            <span style={styles.filterLabel}>Sort:</span>
            {["apy", "tvl", "risk"].map((s) => (
              <button
                key={s}
                className="sort-btn"
                style={{
                  ...styles.filterChip,
                  ...(sortBy === s ? styles.filterActive : {}),
                }}
                onClick={() => setSortBy(s)}
              >
                {s === "apy" ? "APY ↓" : s === "tvl" ? "TVL ↓" : "Risk ↑"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pool Table */}
      <div style={styles.tableContainer}>
        <div style={styles.tableHeader}>
          <span style={{ flex: 2 }}>Pool</span>
          <span style={{ flex: 1, textAlign: "center" }}>APY</span>
          <span style={{ flex: 1, textAlign: "center" }}>Trend</span>
          <span style={{ flex: 1, textAlign: "center" }}>TVL</span>
          <span style={{ flex: 1, textAlign: "center" }}>Risk</span>
          <span style={{ flex: 1, textAlign: "center" }}>Utilization</span>
          <span style={{ flex: 1, textAlign: "right" }}>Action</span>
        </div>

        {filteredPools.map((pool, idx) => (
          <div
            key={idx}
            className="pool-row"
            style={{
              ...styles.tableRow,
              animation: `fade-in 0.3s ease ${idx * 0.05}s both`,
            }}
            onClick={() => { setSelectedPool(pool); setShowDeposit(true); }}
          >
            <span style={{ flex: 2, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{pool.protocolLogo}</span>
              <div>
                <div style={styles.poolName}>{pool.asset}</div>
                <div style={styles.poolProtocol}>
                  {pool.protocol}
                  {pool.bonus && (
                    <span style={styles.bonusBadge}>{pool.bonus}</span>
                  )}
                </div>
              </div>
            </span>
            <span style={{ flex: 1, textAlign: "center" }}>
              <span style={{
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "'DM Mono', monospace",
                color: pool.apy > 20 ? "#22c55e" : pool.apy > 10 ? "#60a5fa" : "#e2e8f0",
              }}>
                {pool.apy}%
              </span>
            </span>
            <span style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <MiniChart
                data={pool.trend}
                color={pool.apy > 20 ? "#22c55e" : "#60a5fa"}
              />
            </span>
            <span style={{ flex: 1, textAlign: "center", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#94a3b8" }}>
              {pool.tvl}
            </span>
            <span style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <RiskMeter level={pool.risk} />
            </span>
            <span style={{ flex: 1, textAlign: "center" }}>
              <div style={styles.utilizationBar}>
                <div style={{
                  ...styles.utilizationFill,
                  width: `${pool.utilization}%`,
                  background: pool.utilization > 85 ? "#f59e0b" : "#60a5fa",
                }} />
              </div>
              <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'DM Mono', monospace" }}>
                {pool.utilization}%
              </span>
            </span>
            <span style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
              <button className="action-btn" style={styles.depositBtn}>
                Deposit
              </button>
            </span>
          </div>
        ))}
      </div>

      {/* Fee info */}
      <div style={styles.feeBar}>
        <span>💡 YieldPilot charges a 0.5% performance fee on profits only — you never pay on principal.</span>
      </div>

      {/* Deposit Modal */}
      {showDeposit && selectedPool && (
        <div style={styles.modalOverlay} onClick={() => setShowDeposit(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setShowDeposit(false)}>✕</button>

            <div style={styles.modalHead}>
              <span style={{ fontSize: 28 }}>{selectedPool.protocolLogo}</span>
              <div>
                <h3 style={styles.modalTitle}>{selectedPool.asset}</h3>
                <p style={styles.modalSubtitle}>{selectedPool.protocol} · {selectedPool.strategy}</p>
              </div>
            </div>

            <div style={styles.modalStats}>
              <div style={styles.modalStatItem}>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>APY</span>
                <span style={{ color: "#22c55e", fontSize: 22, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                  {selectedPool.apy}%
                </span>
              </div>
              <div style={styles.modalStatItem}>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>TVL</span>
                <span style={{ color: "#e2e8f0", fontSize: 16, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>
                  {selectedPool.tvl}
                </span>
              </div>
              <div style={styles.modalStatItem}>
                <span style={{ color: "#94a3b8", fontSize: 11 }}>Risk</span>
                <RiskMeter level={selectedPool.risk} />
              </div>
            </div>

            <div style={styles.depositInput}>
              <label style={styles.inputLabel}>Amount to Deposit</label>
              <div style={styles.inputWrapper}>
                <span style={styles.inputCurrency}>$</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  style={styles.input}
                />
                <button
                  style={styles.maxBtn}
                  onClick={() => setDepositAmount("5000")}
                >
                  MAX
                </button>
              </div>
            </div>

            {depositAmount && (
              <div style={styles.projection}>
                <div style={styles.projRow}>
                  <span style={{ color: "#94a3b8" }}>Estimated 30d earnings</span>
                  <span style={{ color: "#22c55e", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                    +${((parseFloat(depositAmount) * selectedPool.apy / 100) / 12).toFixed(2)}
                  </span>
                </div>
                <div style={styles.projRow}>
                  <span style={{ color: "#94a3b8" }}>Estimated 1yr earnings</span>
                  <span style={{ color: "#22c55e", fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                    +${(parseFloat(depositAmount) * selectedPool.apy / 100).toFixed(2)}
                  </span>
                </div>
                <div style={styles.projRow}>
                  <span style={{ color: "#94a3b8" }}>Performance fee (0.5%)</span>
                  <span style={{ color: "#f59e0b", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                    -${((parseFloat(depositAmount) * selectedPool.apy / 100) * 0.005).toFixed(2)}/yr
                  </span>
                </div>
              </div>
            )}

            <button
              className="action-btn"
              style={{
                ...styles.confirmBtn,
                opacity: depositAmount ? 1 : 0.4,
              }}
              onClick={() => {
                if (depositAmount) {
                  setPortfolio((p) => ({
                    ...p,
                    totalDeposited: p.totalDeposited + parseFloat(depositAmount),
                    positions: p.positions + 1,
                  }));
                  setShowDeposit(false);
                  setDepositAmount("");
                }
              }}
            >
              Deposit via Coinbase Wallet
            </button>

            <p style={{ textAlign: "center", fontSize: 11, color: "#64748b", marginTop: 8 }}>
              You retain full custody. Withdraw anytime.
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
    background: "#0a0e17",
    color: "#e2e8f0",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  ambientGlow: {
    position: "fixed",
    top: -200,
    right: -200,
    width: 600,
    height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    backdropFilter: "blur(12px)",
    position: "relative",
    zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "rgba(96,165,250,0.1)",
    border: "1px solid rgba(96,165,250,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 17,
    fontWeight: 800,
    color: "#60a5fa",
    letterSpacing: -0.5,
    lineHeight: 1,
  },
  logoSub: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: 400,
  },
  headerActions: { display: "flex", alignItems: "center", gap: 12 },
  networkBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 8,
    background: "rgba(34,197,94,0.08)",
    border: "1px solid rgba(34,197,94,0.15)",
    fontSize: 12,
    color: "#22c55e",
    fontWeight: 500,
  },
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#22c55e",
  },
  portfolioSection: {
    padding: "20px 24px",
  },
  portfolioGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
  },
  statCard: {
    padding: "16px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#e2e8f0",
    fontFamily: "'DM Mono', monospace",
  },
  aiCard: {
    margin: "0 24px 20px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(96,165,250,0.06), rgba(34,197,94,0.04))",
    border: "1px solid rgba(96,165,250,0.12)",
    overflow: "hidden",
  },
  aiHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "14px 18px",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "rgba(96,165,250,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e2e8f0",
    lineHeight: 1,
  },
  aiSub: { fontSize: 11, color: "#64748b" },
  aiBody: { padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 },
  aiPool: { display: "flex", alignItems: "center", gap: 10 },
  aiPoolName: { fontSize: 15, fontWeight: 700, color: "#fff", display: "block" },
  aiPoolStrategy: { fontSize: 11, color: "#64748b" },
  aiStats: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  aiStat: {
    display: "flex",
    flexDirection: "column",
  },
  aiReason: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.5,
    padding: "10px 14px",
    background: "rgba(0,0,0,0.2)",
    borderRadius: 8,
    borderLeft: "3px solid rgba(96,165,250,0.3)",
  },
  aiDeposit: {
    padding: "10px 20px",
    borderRadius: 8,
    background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
    color: "#fff",
    border: "none",
    fontWeight: 700,
    fontSize: 13,
    alignSelf: "flex-start",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  controls: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 24px 12px",
    flexWrap: "wrap",
    gap: 12,
  },
  controlLeft: { display: "flex", alignItems: "center", gap: 10 },
  tableTitle: { fontSize: 17, fontWeight: 700, color: "#e2e8f0" },
  poolCount: { fontSize: 12, color: "#64748b", fontFamily: "'DM Mono', monospace" },
  controlRight: { display: "flex", gap: 16, flexWrap: "wrap" },
  filterGroup: { display: "flex", alignItems: "center", gap: 4 },
  filterLabel: { fontSize: 11, color: "#64748b", marginRight: 4 },
  filterChip: {
    padding: "5px 10px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "#94a3b8",
    fontSize: 11,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  filterActive: {
    background: "rgba(96,165,250,0.12)",
    border: "1px solid rgba(96,165,250,0.3)",
    color: "#60a5fa",
  },
  tableContainer: {
    margin: "0 24px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    padding: "10px 16px",
    background: "rgba(255,255,255,0.02)",
    fontSize: 10,
    color: "#64748b",
    fontFamily: "'DM Mono', monospace",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.03)",
  },
  poolName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#e2e8f0",
    fontFamily: "'DM Mono', monospace",
  },
  poolProtocol: {
    fontSize: 11,
    color: "#64748b",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  bonusBadge: {
    fontSize: 9,
    color: "#f59e0b",
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.2)",
    padding: "1px 6px",
    borderRadius: 3,
    fontFamily: "'DM Mono', monospace",
  },
  utilizationBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    margin: "0 auto 2px",
  },
  utilizationFill: {
    height: "100%",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  depositBtn: {
    padding: "6px 14px",
    borderRadius: 6,
    background: "rgba(96,165,250,0.1)",
    border: "1px solid rgba(96,165,250,0.2)",
    color: "#60a5fa",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  feeBar: {
    margin: "16px 24px",
    padding: "10px 16px",
    borderRadius: 8,
    background: "rgba(245,158,11,0.06)",
    border: "1px solid rgba(245,158,11,0.1)",
    fontSize: 12,
    color: "#f59e0b",
    textAlign: "center",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    background: "#0f1420",
    border: "1px solid rgba(96,165,250,0.12)",
    borderRadius: 16,
    padding: "28px 24px",
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
    color: "#64748b",
    fontSize: 18,
    cursor: "pointer",
  },
  modalHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 800, color: "#e2e8f0" },
  modalSubtitle: { fontSize: 12, color: "#64748b" },
  modalStats: {
    display: "flex",
    gap: 20,
    padding: "14px",
    background: "rgba(255,255,255,0.02)",
    borderRadius: 10,
    marginBottom: 16,
  },
  modalStatItem: { display: "flex", flexDirection: "column", gap: 4 },
  depositInput: { marginBottom: 16 },
  inputLabel: { fontSize: 12, color: "#94a3b8", marginBottom: 6, display: "block" },
  inputWrapper: {
    display: "flex",
    alignItems: "center",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    overflow: "hidden",
  },
  inputCurrency: {
    padding: "12px",
    color: "#64748b",
    fontSize: 18,
    fontFamily: "'DM Mono', monospace",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#e2e8f0",
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "'DM Mono', monospace",
    padding: "12px 0",
  },
  maxBtn: {
    padding: "6px 12px",
    margin: 6,
    borderRadius: 6,
    background: "rgba(96,165,250,0.1)",
    border: "1px solid rgba(96,165,250,0.2)",
    color: "#60a5fa",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'DM Mono', monospace",
  },
  projection: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
    background: "rgba(34,197,94,0.04)",
    border: "1px solid rgba(34,197,94,0.08)",
    borderRadius: 10,
    marginBottom: 16,
  },
  projRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 12,
  },
  confirmBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 10,
    background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    border: "none",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
};
