import { useState } from "react";

const PROTOCOLS = [
  {
    name: "Morpho Blue", logo: "🔵", tvl: "$2.14B", audited: true,
    pools: [
      { asset: "USDC", apy: 8.42, risk: "Low", tvl: "$890M", utilization: 76, strategy: "Lending", trend: [6.2, 7.1, 7.8, 8.1, 8.4, 8.42], bonus: null },
      { asset: "ETH", apy: 4.18, risk: "Low", tvl: "$620M", utilization: 62, strategy: "Lending", trend: [3.1, 3.5, 3.8, 4.0, 4.1, 4.18], bonus: null },
      { asset: "cbETH", apy: 5.74, risk: "Low", tvl: "$340M", utilization: 58, strategy: "Lending + Staking", trend: [4.2, 4.8, 5.1, 5.4, 5.6, 5.74], bonus: "+1.2% staking" },
    ],
  },
  {
    name: "Aerodrome", logo: "✈️", tvl: "$1.82B", audited: true,
    pools: [
      { asset: "USDC/ETH", apy: 24.6, risk: "Medium", tvl: "$310M", utilization: 88, strategy: "LP + Emissions", trend: [18, 20, 22, 23, 24, 24.6], bonus: "+12% AERO" },
      { asset: "USDC/USDbC", apy: 6.12, risk: "Low", tvl: "$180M", utilization: 94, strategy: "Stable LP", trend: [5.1, 5.4, 5.8, 6.0, 6.1, 6.12], bonus: "+2% AERO" },
      { asset: "ETH/AERO", apy: 42.8, risk: "High", tvl: "$95M", utilization: 72, strategy: "Volatile LP", trend: [30, 35, 38, 40, 41, 42.8], bonus: "+28% AERO" },
    ],
  },
  {
    name: "Moonwell", logo: "🌙", tvl: "$420M", audited: true,
    pools: [
      { asset: "USDC", apy: 7.24, risk: "Low", tvl: "$210M", utilization: 71, strategy: "Lending", trend: [5.8, 6.1, 6.5, 6.8, 7.0, 7.24], bonus: "+0.8% WELL" },
      { asset: "ETH", apy: 3.86, risk: "Low", tvl: "$120M", utilization: 55, strategy: "Lending", trend: [2.9, 3.1, 3.4, 3.6, 3.8, 3.86], bonus: null },
    ],
  },
  {
    name: "Seamless", logo: "🌊", tvl: "$290M", audited: true,
    pools: [
      { asset: "USDC", apy: 9.12, risk: "Low", tvl: "$145M", utilization: 78, strategy: "Lending", trend: [7.1, 7.8, 8.2, 8.6, 8.9, 9.12], bonus: null },
      { asset: "ETH", apy: 5.24, risk: "Low", tvl: "$95M", utilization: 64, strategy: "Lending", trend: [3.8, 4.2, 4.5, 4.8, 5.0, 5.24], bonus: null },
    ],
  },
];

function MiniChart({ data, color = "var(--green)", width = 80, height = 28 }) {
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
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RiskBadge({ level }) {
  const colors = { Low: "var(--green)", Medium: "var(--amber)", High: "var(--red)" };
  const bgs = { Low: "var(--green-bg)", Medium: "var(--amber-bg)", High: "var(--red-bg)" };
  return (
    <span className="badge" style={{ background: bgs[level], color: colors[level] }}>{level}</span>
  );
}

export default function YieldPilot() {
  const [sortBy, setSortBy] = useState("apy");
  const [riskFilter, setRiskFilter] = useState("all");
  const [portfolio] = useState({ totalDeposited: 12480, totalEarned: 847.32, avgApy: 11.4, positions: 4 });

  const allPools = PROTOCOLS.flatMap((p) =>
    p.pools.map((pool) => ({ ...pool, protocol: p.name, protocolLogo: p.logo, protocolTvl: p.tvl }))
  );

  const filteredPools = allPools
    .filter((p) => riskFilter === "all" || p.risk === riskFilter)
    .sort((a, b) => {
      if (sortBy === "apy") return b.apy - a.apy;
      if (sortBy === "tvl") return parseFloat(b.tvl.replace(/[\$M,B]/g, "")) - parseFloat(a.tvl.replace(/[\$M,B]/g, ""));
      if (sortBy === "risk") { const order = { Low: 0, Medium: 1, High: 2 }; return order[a.risk] - order[b.risk]; }
      return 0;
    });

  const aiPick = filteredPools.find((p) => p.risk === "Low" && p.apy > 7) || filteredPools[0];

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-header">
        <div className="app-title">
          <div className="app-title-icon" style={{ background: "var(--green-bg)" }}>📊</div>
          <div>
            <h1>YieldPilot</h1>
            <p>AI-Optimized DeFi Yields on Base</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total Deposited</div>
          <div className="stat-card-value">${portfolio.totalDeposited.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Earnings (30D)</div>
          <div className="stat-card-value" style={{ color: "var(--green)" }}>+${portfolio.totalEarned.toFixed(2)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg. APY</div>
          <div className="stat-card-value">{portfolio.avgApy}%</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Active Positions</div>
          <div className="stat-card-value">{portfolio.positions}</div>
        </div>
      </div>

      {/* AI Recommendation */}
      {aiPick && (
        <div className="card" style={{ marginBottom: 24, borderColor: "var(--green-border)" }}>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 20 }}>🧠</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>AI Recommendation</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Best risk-adjusted yield right now</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 18 }}>{aiPick.protocolLogo}</span>
              <span style={{ fontWeight: 600 }}>{aiPick.asset} on {aiPick.protocol}</span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{aiPick.strategy}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 600, color: "var(--green)" }}>{aiPick.apy}%</span>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>APY</span>
              <RiskBadge level={aiPick.risk} />
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
              This pool offers the best risk-adjusted return on Base. High TVL ({aiPick.tvl}), audited protocol, and consistent yield trend.
            </p>
            <button className="btn btn-success">Deposit Now →</button>
          </div>
        </div>
      )}

      {/* Filters & Sort */}
      <div className="section-header">
        <h2 className="section-title">All Yield Opportunities</h2>
        <div style={{ display: "flex", gap: 4 }}>
          {["apy", "tvl", "risk"].map((s) => (
            <button key={s} className={`filter-pill ${sortBy === s ? "active" : ""}`} onClick={() => setSortBy(s)}>
              Sort: {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        {["all", "Low", "Medium", "High"].map((r) => (
          <button key={r} className={`filter-pill ${riskFilter === r ? "active" : ""}`} onClick={() => setRiskFilter(r)}>
            {r === "all" ? "All Risks" : r}
          </button>
        ))}
      </div>

      {/* Pool List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filteredPools.map((pool, idx) => (
          <div key={idx} className="pool-card">
            <div className="pool-header">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{pool.protocolLogo}</span>
                <div>
                  <span className="pool-name">{pool.asset}</span>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>{pool.protocol}</span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <MiniChart data={pool.trend} color={pool.risk === "High" ? "var(--red)" : pool.risk === "Medium" ? "var(--amber)" : "var(--green)"} />
                <RiskBadge level={pool.risk} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ display: "flex", gap: 24 }}>
                <div>
                  <span className="pool-apy" style={{ fontSize: 22 }}>{pool.apy}%</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 4 }}>APY</span>
                </div>
                <div className="pool-meta">
                  <span>TVL: {pool.tvl}</span>
                  <span>Strategy: {pool.strategy}</span>
                  {pool.bonus && <span style={{ color: "var(--blue)" }}>{pool.bonus}</span>}
                </div>
              </div>
              <button className="btn btn-primary btn-sm">Deposit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
