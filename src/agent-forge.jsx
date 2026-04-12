import { useState, useEffect, useCallback } from "react";

const TEMPLATES = [
  {
    id: "yield-hunter",
    name: "Yield Hunter",
    icon: "🎯",
    description: "Auto-scans Base DeFi protocols and moves funds to highest-yield opportunities",
    category: "DeFi",
    difficulty: "Beginner",
    users: 2847,
    avgReturn: "+14.2%",
    nodes: ["Monitor Yields", "Compare APY", "If APY > threshold", "Execute Deposit", "Notify Owner"],
    color: "#22c55e",
  },
  {
    id: "whale-follower",
    name: "Whale Copier",
    icon: "🐋",
    description: "Mirrors trades from top smart money wallets on Base with configurable delay",
    category: "Trading",
    difficulty: "Intermediate",
    users: 1923,
    avgReturn: "+28.7%",
    nodes: ["Track Wallets", "Filter by Size", "Analyze Token", "If Safe → Buy", "Set Stop Loss"],
    color: "#60a5fa",
  },
  {
    id: "dca-bot",
    name: "Smart DCA",
    icon: "📈",
    description: "Dollar-cost averages into tokens with AI-optimized timing based on volatility",
    category: "Trading",
    difficulty: "Beginner",
    users: 4210,
    avgReturn: "+9.4%",
    nodes: ["Check Schedule", "Analyze Volatility", "Optimal Entry", "Execute Buy", "Log Trade"],
    color: "#a78bfa",
  },
  {
    id: "arb-scanner",
    name: "Arbitrage Scanner",
    icon: "⚡",
    description: "Detects price discrepancies across Base DEXs and executes instant arbitrage",
    category: "Trading",
    difficulty: "Advanced",
    users: 892,
    avgReturn: "+42.1%",
    nodes: ["Scan DEXs", "Calculate Spread", "Simulate Gas", "If Profitable", "Flash Execute"],
    color: "#f59e0b",
  },
  {
    id: "lp-manager",
    name: "LP Rebalancer",
    icon: "⚖️",
    description: "Monitors LP positions and auto-rebalances to minimize impermanent loss",
    category: "DeFi",
    difficulty: "Intermediate",
    users: 1456,
    avgReturn: "+18.6%",
    nodes: ["Monitor Position", "Calculate IL", "If IL > 2%", "Rebalance", "Report"],
    color: "#ec4899",
  },
  {
    id: "sniper",
    name: "Token Sniper",
    icon: "🔫",
    description: "Detects new token launches on Base with safety checks and auto-buys vetted tokens",
    category: "Degen",
    difficulty: "Advanced",
    users: 3102,
    avgReturn: "+67.3%",
    nodes: ["Watch Factory", "Audit Contract", "Check Liquidity", "If Safe → Snipe", "Auto-Sell Target"],
    color: "#ef4444",
  },
];

const AGENT_STATUS = [
  {
    id: 1,
    name: "My Yield Hunter",
    template: "Yield Hunter",
    icon: "🎯",
    status: "running",
    uptime: "12d 4h",
    trades: 47,
    pnl: 1247.82,
    pnlPct: 12.4,
    lastAction: "Moved $2.4K to Seamless USDC (9.12% APY)",
    lastActionTime: "23m ago",
    gasSpent: 4.21,
    wallet: "0x7a2...e4f",
    balance: 10847.32,
  },
  {
    id: 2,
    name: "Base Whale Tracker",
    template: "Whale Copier",
    icon: "🐋",
    status: "running",
    uptime: "8d 11h",
    trades: 23,
    pnl: 3842.56,
    pnlPct: 28.7,
    lastAction: "Bought $890 AERO (copying Paradigm wallet)",
    lastActionTime: "1h ago",
    gasSpent: 8.92,
    wallet: "0x3f1...b8c",
    balance: 17242.56,
  },
  {
    id: 3,
    name: "ETH DCA Bot",
    template: "Smart DCA",
    icon: "📈",
    status: "paused",
    uptime: "30d 2h",
    trades: 30,
    pnl: 421.90,
    pnlPct: 8.4,
    lastAction: "Bought 0.12 ETH at $3,812",
    lastActionTime: "2d ago",
    gasSpent: 2.14,
    wallet: "0x9e5...d7a",
    balance: 5421.90,
  },
];

function NodeFlow({ nodes, color }) {
  return (
    <div style={nodeFlowStyles.container}>
      {nodes.map((node, i) => (
        <div key={i} style={nodeFlowStyles.nodeWrapper}>
          <div style={{
            ...nodeFlowStyles.node,
            borderColor: `${color}40`,
            background: `${color}08`,
          }}>
            <div style={{
              ...nodeFlowStyles.dot,
              background: color,
              boxShadow: `0 0 8px ${color}60`,
            }} />
            <span style={nodeFlowStyles.label}>{node}</span>
          </div>
          {i < nodes.length - 1 && (
            <div style={{ ...nodeFlowStyles.connector, borderColor: `${color}30` }}>
              <span style={{ color: `${color}80`, fontSize: 10 }}>→</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const nodeFlowStyles = {
  container: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center",
  },
  nodeWrapper: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  node: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid",
    fontSize: 10,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    flexShrink: 0,
  },
  label: {
    color: "#cbd5e1",
    whiteSpace: "nowrap",
  },
  connector: {
    borderBottom: "1px dashed",
    width: 12,
  },
};

export default function AgentForge() {
  const [view, setView] = useState("dashboard");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [agents, setAgents] = useState(AGENT_STATUS);
  const [showCreate, setShowCreate] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentBudget, setAgentBudget] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showPricing, setShowPricing] = useState(false);

  const totalPnl = agents.reduce((s, a) => s + a.pnl, 0);
  const totalBalance = agents.reduce((s, a) => s + a.balance, 0);
  const activeAgents = agents.filter((a) => a.status === "running").length;

  const filteredTemplates = categoryFilter === "all"
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === categoryFilter);

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Sora:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes orbit { 0% { transform: rotate(0deg) translateX(120px) rotate(0deg); } 100% { transform: rotate(360deg) translateX(120px) rotate(-360deg); } }
        @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glow-pulse { 0%, 100% { box-shadow: 0 0 20px rgba(139,92,246,0.1); } 50% { box-shadow: 0 0 40px rgba(139,92,246,0.2); } }

        .card-hover { transition: all 0.25s ease; cursor: pointer; }
        .card-hover:hover { transform: translateY(-3px); border-color: rgba(139,92,246,0.3) !important; }

        .btn-action { transition: all 0.2s ease; cursor: pointer; }
        .btn-action:hover { transform: translateY(-1px); }

        .nav-btn { transition: all 0.15s ease; cursor: pointer; }
        .nav-btn:hover { background: rgba(255,255,255,0.06); }

        .status-pulse { animation: glow-pulse 3s ease-in-out infinite; }

        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
      `}</style>

      {/* Background orbs */}
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="2" fill="#8b5cf6" />
              <rect x="14" y="3" width="7" height="7" rx="2" fill="#8b5cf6" opacity="0.6" />
              <rect x="3" y="14" width="7" height="7" rx="2" fill="#8b5cf6" opacity="0.6" />
              <rect x="14" y="14" width="7" height="7" rx="2" fill="#8b5cf6" opacity="0.3" />
              <line x1="10" y1="6.5" x2="14" y2="6.5" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="2 2" />
              <line x1="6.5" y1="10" x2="6.5" y2="14" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="2 2" />
            </svg>
          </div>
          <div>
            <h1 style={styles.logo}>AgentForge</h1>
            <p style={styles.logoSub}>No-Code AI Agents on Base</p>
          </div>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.navTabs}>
            {["dashboard", "templates", "pricing"].map((v) => (
              <button
                key={v}
                className="nav-btn"
                style={{
                  ...styles.navTab,
                  ...(view === v ? styles.navTabActive : {}),
                }}
                onClick={() => setView(v)}
              >
                {v === "dashboard" && "⚙️ "}
                {v === "templates" && "🧩 "}
                {v === "pricing" && "💎 "}
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* DASHBOARD VIEW */}
      {view === "dashboard" && (
        <div style={styles.content}>
          {/* Stats */}
          <div style={styles.statsGrid}>
            <div style={{ ...styles.statCard, borderTop: "2px solid #8b5cf6" }}>
              <span style={styles.statLabel}>Active Agents</span>
              <span style={styles.statValue}>{activeAgents}/{agents.length}</span>
              <div style={styles.statIndicator}>
                <div style={styles.runningDot} />
                <span style={{ fontSize: 10, color: "#22c55e" }}>All systems nominal</span>
              </div>
            </div>
            <div style={{ ...styles.statCard, borderTop: "2px solid #22c55e" }}>
              <span style={styles.statLabel}>Total PnL (30d)</span>
              <span style={{ ...styles.statValue, color: "#22c55e" }}>+${totalPnl.toFixed(2)}</span>
              <span style={{ fontSize: 10, color: "#64748b" }}>After fees</span>
            </div>
            <div style={{ ...styles.statCard, borderTop: "2px solid #60a5fa" }}>
              <span style={styles.statLabel}>Agent Balances</span>
              <span style={styles.statValue}>${totalBalance.toLocaleString()}</span>
              <span style={{ fontSize: 10, color: "#64748b" }}>Across {agents.length} wallets</span>
            </div>
            <div style={{
              ...styles.statCard,
              borderTop: "2px solid #f59e0b",
              cursor: "pointer",
            }} onClick={() => setView("templates")}>
              <span style={styles.statLabel}>Deploy New</span>
              <span style={{ fontSize: 28 }}>+</span>
              <span style={{ fontSize: 10, color: "#f59e0b" }}>Choose a template</span>
            </div>
          </div>

          {/* Agent List */}
          <h2 style={styles.sectionTitle}>Your Agents</h2>
          <div style={styles.agentList}>
            {agents.map((agent, idx) => (
              <div
                key={agent.id}
                className="card-hover status-pulse"
                style={{
                  ...styles.agentCard,
                  animation: `fade-up 0.3s ease ${idx * 0.08}s both`,
                }}
              >
                <div style={styles.agentHeader}>
                  <div style={styles.agentInfo}>
                    <span style={{ fontSize: 24 }}>{agent.icon}</span>
                    <div>
                      <h3 style={styles.agentName}>{agent.name}</h3>
                      <span style={styles.agentTemplate}>{agent.template} template</span>
                    </div>
                  </div>
                  <div style={{
                    ...styles.statusBadge,
                    background: agent.status === "running" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                    color: agent.status === "running" ? "#22c55e" : "#f59e0b",
                    border: `1px solid ${agent.status === "running" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                  }}>
                    <div style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: agent.status === "running" ? "#22c55e" : "#f59e0b",
                    }} />
                    {agent.status}
                  </div>
                </div>

                <div style={styles.agentStats}>
                  <div style={styles.agentStatItem}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>PnL</span>
                    <span style={{
                      color: agent.pnl >= 0 ? "#22c55e" : "#ef4444",
                      fontWeight: 700,
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 15,
                    }}>
                      {agent.pnl >= 0 ? "+" : ""}${agent.pnl.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: agent.pnl >= 0 ? "#22c55e" : "#ef4444" }}>
                      {agent.pnl >= 0 ? "+" : ""}{agent.pnlPct}%
                    </span>
                  </div>
                  <div style={styles.agentStatItem}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Trades</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15 }}>
                      {agent.trades}
                    </span>
                  </div>
                  <div style={styles.agentStatItem}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Uptime</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
                      {agent.uptime}
                    </span>
                  </div>
                  <div style={styles.agentStatItem}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Balance</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", fontSize: 15 }}>
                      ${agent.balance.toLocaleString()}
                    </span>
                  </div>
                  <div style={styles.agentStatItem}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Gas Spent</span>
                    <span style={{ color: "#94a3b8", fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}>
                      ${agent.gasSpent}
                    </span>
                  </div>
                </div>

                <div style={styles.agentAction}>
                  <div style={styles.lastAction}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Last action ({agent.lastActionTime})</span>
                    <span style={{ color: "#cbd5e1", fontSize: 12 }}>{agent.lastAction}</span>
                  </div>
                  <div style={styles.agentButtons}>
                    <button className="btn-action" style={{
                      ...styles.agentBtn,
                      background: agent.status === "running" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                      color: agent.status === "running" ? "#f59e0b" : "#22c55e",
                      border: `1px solid ${agent.status === "running" ? "rgba(245,158,11,0.2)" : "rgba(34,197,94,0.2)"}`,
                    }}
                      onClick={() => {
                        setAgents((prev) =>
                          prev.map((a) =>
                            a.id === agent.id
                              ? { ...a, status: a.status === "running" ? "paused" : "running" }
                              : a
                          )
                        );
                      }}
                    >
                      {agent.status === "running" ? "⏸ Pause" : "▶ Resume"}
                    </button>
                    <button className="btn-action" style={{
                      ...styles.agentBtn,
                      background: "rgba(96,165,250,0.1)",
                      color: "#60a5fa",
                      border: "1px solid rgba(96,165,250,0.2)",
                    }}>
                      📊 Logs
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TEMPLATES VIEW */}
      {view === "templates" && (
        <div style={styles.content}>
          <div style={styles.templateHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Agent Templates</h2>
              <p style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
                Pick a strategy. Customize the rules. Deploy in one click.
              </p>
            </div>
            <div style={styles.catFilters}>
              {["all", "DeFi", "Trading", "Degen"].map((c) => (
                <button
                  key={c}
                  className="nav-btn"
                  style={{
                    ...styles.catChip,
                    ...(categoryFilter === c ? styles.catChipActive : {}),
                  }}
                  onClick={() => setCategoryFilter(c)}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.templateGrid}>
            {filteredTemplates.map((t, idx) => (
              <div
                key={t.id}
                className="card-hover"
                style={{
                  ...styles.templateCard,
                  borderTop: `2px solid ${t.color}`,
                  animation: `fade-up 0.3s ease ${idx * 0.06}s both`,
                }}
                onClick={() => { setSelectedTemplate(t); setShowCreate(true); }}
              >
                <div style={styles.templateTop}>
                  <span style={{ fontSize: 32 }}>{t.icon}</span>
                  <div style={{
                    ...styles.difficultyBadge,
                    background: t.difficulty === "Beginner" ? "rgba(34,197,94,0.1)" : t.difficulty === "Intermediate" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                    color: t.difficulty === "Beginner" ? "#22c55e" : t.difficulty === "Intermediate" ? "#f59e0b" : "#ef4444",
                    border: `1px solid ${t.difficulty === "Beginner" ? "rgba(34,197,94,0.2)" : t.difficulty === "Intermediate" ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)"}`,
                  }}>
                    {t.difficulty}
                  </div>
                </div>

                <h3 style={styles.templateName}>{t.name}</h3>
                <p style={styles.templateDesc}>{t.description}</p>

                <NodeFlow nodes={t.nodes} color={t.color} />

                <div style={styles.templateStats}>
                  <div style={styles.templateStat}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Users</span>
                    <span style={{ color: "#e2e8f0", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {t.users.toLocaleString()}
                    </span>
                  </div>
                  <div style={styles.templateStat}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Avg Return</span>
                    <span style={{ color: "#22c55e", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {t.avgReturn}
                    </span>
                  </div>
                  <div style={styles.templateStat}>
                    <span style={{ color: "#64748b", fontSize: 10 }}>Category</span>
                    <span style={{ color: t.color, fontWeight: 600, fontSize: 12 }}>{t.category}</span>
                  </div>
                </div>

                <button className="btn-action" style={{
                  ...styles.deployBtn,
                  background: `${t.color}15`,
                  color: t.color,
                  border: `1px solid ${t.color}30`,
                }}>
                  Deploy Agent →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRICING VIEW */}
      {view === "pricing" && (
        <div style={styles.content}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <h2 style={{ ...styles.sectionTitle, justifyContent: "center", fontSize: 28 }}>
              Choose Your Plan
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, marginTop: 6 }}>
              Scale your autonomous trading fleet on Base
            </p>
          </div>

          <div style={styles.pricingGrid}>
            {[
              {
                name: "Starter",
                price: "Free",
                color: "#94a3b8",
                features: ["1 active agent", "Basic templates", "5 trades/day limit", "Community support", "Standard latency"],
                cta: "Get Started",
              },
              {
                name: "Pro",
                price: "$29",
                period: "/mo",
                color: "#8b5cf6",
                popular: true,
                features: ["5 active agents", "All templates", "Unlimited trades", "Priority latency", "Telegram alerts", "Advanced conditions", "API access"],
                cta: "Start 7-Day Trial",
              },
              {
                name: "Whale",
                price: "$99",
                period: "/mo",
                color: "#f59e0b",
                features: ["Unlimited agents", "Custom strategies", "Unlimited trades", "Fastest latency", "Dedicated support", "Custom API webhooks", "White-label ready", "Multi-wallet management"],
                cta: "Contact Sales",
              },
            ].map((plan, idx) => (
              <div
                key={idx}
                style={{
                  ...styles.pricingCard,
                  borderTop: `2px solid ${plan.color}`,
                  ...(plan.popular ? {
                    background: "rgba(139,92,246,0.04)",
                    border: "1px solid rgba(139,92,246,0.15)",
                    borderTop: "2px solid #8b5cf6",
                    transform: "scale(1.02)",
                  } : {}),
                }}
              >
                {plan.popular && (
                  <div style={styles.popularBadge}>Most Popular</div>
                )}
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{plan.name}</h3>
                <div style={styles.priceRow}>
                  <span style={{ fontSize: 40, fontWeight: 800, color: plan.color, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {plan.price}
                  </span>
                  {plan.period && <span style={{ color: "#64748b", fontSize: 14 }}>{plan.period}</span>}
                </div>
                <div style={styles.featureList}>
                  {plan.features.map((f, i) => (
                    <div key={i} style={styles.featureItem}>
                      <span style={{ color: plan.color }}>✓</span>
                      <span style={{ color: "#cbd5e1", fontSize: 13 }}>{f}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-action" style={{
                  ...styles.pricingCta,
                  background: plan.popular ? `linear-gradient(135deg, ${plan.color}, #7c3aed)` : `${plan.color}15`,
                  color: plan.popular ? "#fff" : plan.color,
                  border: plan.popular ? "none" : `1px solid ${plan.color}30`,
                }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <div style={styles.feeNote}>
            <span>💡</span> All plans include a 1% performance fee on agent profits. No fee on losses or principal.
          </div>
        </div>
      )}

      {/* Create Agent Modal */}
      {showCreate && selectedTemplate && (
        <div style={styles.modalOverlay} onClick={() => setShowCreate(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button style={styles.modalClose} onClick={() => setShowCreate(false)}>✕</button>

            <div style={styles.modalHeader}>
              <span style={{ fontSize: 36 }}>{selectedTemplate.icon}</span>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0" }}>
                  Deploy {selectedTemplate.name}
                </h3>
                <p style={{ fontSize: 12, color: "#64748b" }}>{selectedTemplate.description}</p>
              </div>
            </div>

            <div style={{ margin: "16px 0" }}>
              <p style={{ fontSize: 11, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                Agent Pipeline
              </p>
              <NodeFlow nodes={selectedTemplate.nodes} color={selectedTemplate.color} />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Agent Name</label>
              <input
                type="text"
                placeholder={`My ${selectedTemplate.name}`}
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                style={styles.formInput}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Initial Budget (USDC)</label>
              <input
                type="number"
                placeholder="1000"
                value={agentBudget}
                onChange={(e) => setAgentBudget(e.target.value)}
                style={styles.formInput}
              />
              <p style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                Funds will be held in the agent's dedicated Base wallet
              </p>
            </div>

            <div style={{ ...styles.formGroup, padding: "12px", background: "rgba(139,92,246,0.06)", borderRadius: 10, border: "1px solid rgba(139,92,246,0.12)" }}>
              <p style={{ fontSize: 12, color: "#a78bfa", fontWeight: 600, marginBottom: 6 }}>
                ⚡ Safety Guardrails (auto-enabled)
              </p>
              {["Max single trade: 10% of budget", "Stop-loss: -15% per position", "Daily loss limit: -5% of total", "Rug-pull detection: auto-exit"].map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#22c55e" }}>
                    ✓
                  </div>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{g}</span>
                </div>
              ))}
            </div>

            <button
              className="btn-action"
              style={{
                ...styles.launchBtn,
                opacity: agentName && agentBudget ? 1 : 0.4,
                background: `linear-gradient(135deg, ${selectedTemplate.color}, ${selectedTemplate.color}cc)`,
              }}
              onClick={() => {
                if (agentName && agentBudget) {
                  setAgents((prev) => [
                    {
                      id: Date.now(),
                      name: agentName,
                      template: selectedTemplate.name,
                      icon: selectedTemplate.icon,
                      status: "running",
                      uptime: "0m",
                      trades: 0,
                      pnl: 0,
                      pnlPct: 0,
                      lastAction: "Agent deployed, scanning opportunities...",
                      lastActionTime: "just now",
                      gasSpent: 0,
                      wallet: `0x${Math.random().toString(16).slice(2, 5)}...${Math.random().toString(16).slice(2, 5)}`,
                      balance: parseFloat(agentBudget),
                    },
                    ...prev,
                  ]);
                  setShowCreate(false);
                  setAgentName("");
                  setAgentBudget("");
                  setView("dashboard");
                }
              }}
            >
              🚀 Launch Agent
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "#080b14",
    color: "#e2e8f0",
    fontFamily: "'Sora', sans-serif",
    position: "relative",
    overflow: "hidden",
  },
  orb1: {
    position: "fixed",
    top: -100,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  orb2: {
    position: "fixed",
    bottom: -150,
    right: -150,
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(96,165,250,0.04) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    backdropFilter: "blur(12px)",
    position: "relative",
    zIndex: 10,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "rgba(139,92,246,0.1)",
    border: "1px solid rgba(139,92,246,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 17,
    fontWeight: 800,
    color: "#a78bfa",
    letterSpacing: -0.3,
    lineHeight: 1,
  },
  logoSub: { fontSize: 10, color: "#64748b" },
  headerRight: { display: "flex", alignItems: "center" },
  navTabs: { display: "flex", gap: 4 },
  navTab: {
    padding: "7px 14px",
    borderRadius: 6,
    background: "transparent",
    color: "#94a3b8",
    border: "none",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: "'Sora', sans-serif",
  },
  navTabActive: {
    background: "rgba(139,92,246,0.1)",
    color: "#a78bfa",
    border: "1px solid rgba(139,92,246,0.2)",
  },
  content: {
    padding: "20px 24px",
    position: "relative",
    zIndex: 5,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 24,
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
    fontSize: 10,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  statValue: {
    fontSize: 22,
    fontWeight: 700,
    color: "#e2e8f0",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  statIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  runningDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    background: "#22c55e",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#e2e8f0",
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  agentList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  agentCard: {
    padding: "18px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.015)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  agentHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agentInfo: { display: "flex", alignItems: "center", gap: 10 },
  agentName: { fontSize: 15, fontWeight: 700, color: "#e2e8f0", lineHeight: 1 },
  agentTemplate: { fontSize: 11, color: "#64748b" },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "capitalize",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  agentStats: {
    display: "flex",
    gap: 20,
    flexWrap: "wrap",
  },
  agentStatItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  agentAction: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    flexWrap: "wrap",
  },
  lastAction: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 200,
  },
  agentButtons: { display: "flex", gap: 6 },
  agentBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  templateHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    flexWrap: "wrap",
    gap: 12,
  },
  catFilters: { display: "flex", gap: 4 },
  catChip: {
    padding: "5px 12px",
    borderRadius: 6,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "#94a3b8",
    fontSize: 12,
    fontFamily: "'Sora', sans-serif",
  },
  catChipActive: {
    background: "rgba(139,92,246,0.1)",
    color: "#a78bfa",
    border: "1px solid rgba(139,92,246,0.2)",
  },
  templateGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: 14,
  },
  templateCard: {
    padding: "18px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.015)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  templateTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  difficultyBadge: {
    padding: "3px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  templateName: { fontSize: 17, fontWeight: 700, color: "#e2e8f0" },
  templateDesc: { fontSize: 12, color: "#94a3b8", lineHeight: 1.4 },
  templateStats: {
    display: "flex",
    gap: 16,
    marginTop: 4,
  },
  templateStat: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  deployBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "'Sora', sans-serif",
    textAlign: "center",
  },
  pricingGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    maxWidth: 900,
    margin: "0 auto",
  },
  pricingCard: {
    padding: "24px 20px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.015)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    position: "relative",
  },
  popularBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    background: "#8b5cf6",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: 4,
    letterSpacing: 1,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  priceRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
  },
  featureList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flex: 1,
  },
  featureItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  pricingCta: {
    padding: "12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Sora', sans-serif",
    textAlign: "center",
  },
  feeNote: {
    textAlign: "center",
    padding: "14px",
    margin: "24px auto 0",
    maxWidth: 500,
    borderRadius: 8,
    background: "rgba(245,158,11,0.06)",
    border: "1px solid rgba(245,158,11,0.1)",
    fontSize: 12,
    color: "#f59e0b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
    background: "#0c1020",
    border: "1px solid rgba(139,92,246,0.15)",
    borderRadius: 16,
    padding: "28px 24px",
    maxWidth: 480,
    width: "100%",
    position: "relative",
    maxHeight: "90vh",
    overflowY: "auto",
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
  modalHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  formGroup: { marginBottom: 14 },
  formLabel: {
    fontSize: 11,
    color: "#94a3b8",
    marginBottom: 6,
    display: "block",
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "'IBM Plex Mono', monospace",
  },
  formInput: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#e2e8f0",
    fontSize: 14,
    fontFamily: "'Sora', sans-serif",
    outline: "none",
  },
  launchBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: 10,
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    border: "none",
    fontFamily: "'Sora', sans-serif",
    marginTop: 8,
  },
};
