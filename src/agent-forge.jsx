import { useState } from "react";

const TEMPLATES = [
  { id: "yield-hunter", name: "Yield Hunter", icon: "🎯", description: "Auto-scans Base DeFi protocols and moves funds to highest-yield opportunities", category: "DeFi", difficulty: "Beginner", users: 2847, avgReturn: "+14.2%", nodes: ["Monitor Yields", "Compare APY", "If APY > threshold", "Execute Deposit", "Notify Owner"], color: "#22c55e" },
  { id: "whale-follower", name: "Whale Copier", icon: "🐋", description: "Mirrors trades from top smart money wallets on Base with configurable delay", category: "Trading", difficulty: "Intermediate", users: 1923, avgReturn: "+28.7%", nodes: ["Track Wallets", "Filter by Size", "Analyze Token", "If Safe → Buy", "Set Stop Loss"], color: "#60a5fa" },
  { id: "dca-bot", name: "Smart DCA", icon: "📈", description: "Dollar-cost averages into tokens with AI-optimized timing based on volatility", category: "Trading", difficulty: "Beginner", users: 4210, avgReturn: "+9.4%", nodes: ["Check Schedule", "Analyze Volatility", "Optimal Entry", "Execute Buy", "Log Trade"], color: "#a78bfa" },
  { id: "arb-scanner", name: "Arbitrage Scanner", icon: "⚡", description: "Detects price discrepancies across Base DEXs and executes instant arbitrage", category: "Trading", difficulty: "Advanced", users: 892, avgReturn: "+42.1%", nodes: ["Scan DEXs", "Calculate Spread", "Simulate Gas", "If Profitable", "Flash Execute"], color: "#f59e0b" },
  { id: "lp-manager", name: "LP Rebalancer", icon: "⚖️", description: "Monitors LP positions and auto-rebalances to minimize impermanent loss", category: "DeFi", difficulty: "Intermediate", users: 1456, avgReturn: "+18.6%", nodes: ["Monitor IL", "Calculate Drift", "If Drift > 5%", "Rebalance", "Log Result"], color: "#06b6d4" },
];

const AGENT_STATUS = [
  { id: 1, name: "My Yield Hunter", template: "Yield Hunter", icon: "🎯", status: "running", uptime: "12d 4h", trades: 47, pnl: 1247.82, pnlPct: 12.4, lastAction: "Moved $2.4K to Seamless USDC (9.12% APY)", lastActionTime: "23m ago", gasSpent: 4.21, balance: 10847.32 },
  { id: 2, name: "Base Whale Tracker", template: "Whale Copier", icon: "🐋", status: "running", uptime: "8d 11h", trades: 23, pnl: 3842.56, pnlPct: 28.7, lastAction: "Bought $890 AERO (copying Paradigm wallet)", lastActionTime: "1h ago", gasSpent: 8.92, balance: 17242.56 },
  { id: 3, name: "ETH DCA Bot", template: "Smart DCA", icon: "📈", status: "paused", uptime: "30d 2h", trades: 30, pnl: 421.90, pnlPct: 8.4, lastAction: "Bought 0.12 ETH at $3,812", lastActionTime: "2d ago", gasSpent: 2.14, balance: 5421.90 },
];

function NodeFlow({ nodes, color }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {nodes.map((node, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, border: `1px solid ${color}30`, background: `${color}08`, fontSize: 10, fontFamily: "var(--mono)" }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
            <span style={{ color: "var(--text-secondary)" }}>{node}</span>
          </div>
          {i < nodes.length - 1 && <span style={{ color: `${color}60`, fontSize: 10 }}>→</span>}
        </div>
      ))}
    </div>
  );
}

export default function AgentForge() {
  const [view, setView] = useState("dashboard");
  const [agents, setAgents] = useState(AGENT_STATUS);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const totalPnl = agents.reduce((s, a) => s + a.pnl, 0);
  const totalBalance = agents.reduce((s, a) => s + a.balance, 0);
  const activeAgents = agents.filter((a) => a.status === "running").length;
  const filteredTemplates = categoryFilter === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === categoryFilter);

  return (
    <div className="app-page">
      {/* Header */}
      <div className="app-header">
        <div className="app-title">
          <div className="app-title-icon" style={{ background: "var(--purple-bg)" }}>🤖</div>
          <div>
            <h1>AgentForge</h1>
            <p>No-Code AI Agents on Base</p>
          </div>
        </div>
        <div className="app-header-right">
          {["dashboard", "templates"].map((v) => (
            <button key={v} className={`filter-pill ${view === v ? "active" : ""}`} onClick={() => setView(v)}>
              {v === "dashboard" && "⚙️ "}{v === "templates" && "🧩 "}
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">Active Agents</div>
              <div className="stat-card-value">{activeAgents}/{agents.length}</div>
              <div className="stat-card-sub" style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                All systems nominal
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Total PnL (30D)</div>
              <div className="stat-card-value" style={{ color: "var(--green)" }}>+${totalPnl.toFixed(2)}</div>
              <div className="stat-card-sub">After fees</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Agent Balances</div>
              <div className="stat-card-value">${totalBalance.toLocaleString()}</div>
              <div className="stat-card-sub">Across {agents.length} wallets</div>
            </div>
            <div className="stat-card" style={{ cursor: "pointer" }} onClick={() => setView("templates")}>
              <div className="stat-card-label">Deploy New</div>
              <div className="stat-card-value" style={{ color: "var(--blue)" }}>+</div>
              <div className="stat-card-sub" style={{ color: "var(--blue)" }}>Choose a template</div>
            </div>
          </div>

          <div className="section-header">
            <h2 className="section-title">Your Agents</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {agents.map((agent) => (
              <div key={agent.id} className="agent-card">
                <div className="agent-header">
                  <div className="agent-icon" style={{ background: "var(--bg-elevated)", fontSize: 24 }}>{agent.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="agent-name">{agent.name}</div>
                    <div className="agent-template">{agent.template} template</div>
                  </div>
                  <span className="badge" style={{
                    background: agent.status === "running" ? "var(--green-bg)" : "var(--amber-bg)",
                    color: agent.status === "running" ? "var(--green)" : "var(--amber)",
                  }}>
                    {agent.status === "running" ? "● Running" : "⏸ Paused"}
                  </span>
                </div>
                <div className="agent-stats">
                  <div>
                    <div className="agent-stat-label">PnL</div>
                    <div className="agent-stat-value" style={{ color: "var(--green)" }}>+${agent.pnl.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="agent-stat-label">Trades</div>
                    <div className="agent-stat-value">{agent.trades}</div>
                  </div>
                  <div>
                    <div className="agent-stat-label">Uptime</div>
                    <div className="agent-stat-value">{agent.uptime}</div>
                  </div>
                  <div>
                    <div className="agent-stat-label">Balance</div>
                    <div className="agent-stat-value">${agent.balance.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="agent-stat-label">Gas Spent</div>
                    <div className="agent-stat-value">${agent.gasSpent}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    Last action ({agent.lastActionTime}): <span style={{ color: "var(--text-secondary)" }}>{agent.lastAction}</span>
                  </div>
                  <div className="agent-actions">
                    <button className="btn btn-outline btn-sm">
                      {agent.status === "running" ? "⏸ Pause" : "▶ Resume"}
                    </button>
                    <button className="btn btn-ghost btn-sm">📊</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* TEMPLATES */}
      {view === "templates" && (
        <>
          <div className="section-header">
            <h2 className="section-title">🧩 Agent Templates</h2>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 20 }}>Choose a strategy template to deploy your AI agent</p>

          <div className="filter-group">
            {["all", "DeFi", "Trading"].map((c) => (
              <button key={c} className={`filter-pill ${categoryFilter === c ? "active" : ""}`} onClick={() => setCategoryFilter(c)}>
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
            {filteredTemplates.map((tpl) => (
              <div key={tpl.id} className="card" style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div className="agent-icon" style={{ background: `${tpl.color}12` }}>{tpl.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{tpl.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{tpl.category} • {tpl.difficulty}</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>{tpl.description}</p>

                <NodeFlow nodes={tpl.nodes} color={tpl.color} />

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-dim)" }}>
                    <span>{tpl.users.toLocaleString()} users</span>
                    <span style={{ color: "var(--green)", fontFamily: "var(--mono)", fontWeight: 600 }}>{tpl.avgReturn}</span>
                  </div>
                  <button className="btn btn-primary btn-sm">Deploy →</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
