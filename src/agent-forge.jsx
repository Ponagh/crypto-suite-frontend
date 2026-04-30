import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "./wallet-integration";
import {
  LineChart, Line, AreaChart, Area, ResponsiveContainer,
  Tooltip, ReferenceLine, YAxis, XAxis,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie, Cell,
} from "recharts";

/*
 * ════════════════════════════════════════════════════════════════════════════════
 *  AGENTFORGE v2 — persisted, allowlist-gated live mode, signed risk agreements
 *  Phase 3 of Sovereign Crypto Suite · Base Mainnet
 * ════════════════════════════════════════════════════════════════════════════════
 */

const AGENT_FORGE_REGISTRY = "0xa67421E8d9119247708c4474BE3Dc76567fC618f";

const REGISTRY_ABI = [
  "function getSubscription(address) view returns (uint8 tier, uint256 expiry, uint256 agentsUsed, uint256 agentsAllowed)",
];

const TIER_META = {
  0: { name: "FREE",  color: "#6a6a82", glow: "rgba(106,106,130,0.3)", allowed: 1,  priceUsd: 0  },
  1: { name: "PRO",   color: "#00ffee", glow: "rgba(0,255,238,0.5)",   allowed: 10, priceUsd: 29 },
  2: { name: "WHALE", color: "#ff2d92", glow: "rgba(255,45,146,0.5)",  allowed: 50, priceUsd: 99 },
};

const STRATEGY_TEMPLATES = [
  { id: "dca",          name: "DCA ACCUMULATOR",  tagline: "Dollar-cost average into a target asset on a fixed schedule",            risk: "Low",    roi30d: 2.4,  capital: "$100 min", params: ["Target token", "Interval (hrs)", "Amount per buy"],      icon: "⏱", color: "#00ffee" },
  { id: "grid",         name: "GRID TRADER",      tagline: "Place buy/sell orders at fixed intervals across a price range",         risk: "Medium", roi30d: 8.1,  capital: "$500 min", params: ["Token pair", "Price range", "Grid levels", "Capital"],   icon: "▦", color: "#ff2d92" },
  { id: "whale-copy",   name: "WHALE COPY",       tagline: "Mirror trades from top-performing on-chain wallets in real time",       risk: "High",   roi30d: 18.7, capital: "$1k min",  params: ["Target wallet", "Max allocation", "Copy delay"],         icon: "◈", color: "#ff9500" },
  { id: "arb",          name: "DEX ARB HUNTER",   tagline: "Exploit price divergence between Aerodrome, Uniswap, and BaseSwap",     risk: "Medium", roi30d: 12.3, capital: "$2k min",  params: ["Token list", "Min spread %", "Max slippage"],            icon: "⇄", color: "#a855ff" },
  { id: "sentiment",    name: "SENTIMENT LONG",   tagline: "Go long when on-chain + social momentum crosses threshold",             risk: "High",   roi30d: 24.0, capital: "$500 min", params: ["Token watchlist", "Sentiment threshold", "Position size"], icon: "▲", color: "#00ff88" },
  { id: "yield-router", name: "YIELD ROUTER",     tagline: "Auto-rebalance between top yield pools when APY deltas shift",          risk: "Low",    roi30d: 5.6,  capital: "$100 min", params: ["Protocol allowlist", "Min APY delta", "Rebalance gas cap"], icon: "⟲", color: "#00ffee" },
];

const TEMPLATES_BY_ID = Object.fromEntries(STRATEGY_TEMPLATES.map(t => [t.id, t]));

const fmtUsd = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `${v < 0 ? "-" : ""}$${(Math.abs(v) / 1_000).toFixed(1)}K`;
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;
};
const fmtPct = (n) => `${(Number(n) || 0) >= 0 ? "+" : ""}${(Number(n) || 0).toFixed(2)}%`;

const hydrateAgent = (row) => {
  const tpl = TEMPLATES_BY_ID[row.template_id] || {};
  return {
    ...row,
    pnl: Number(row.pnl) || 0,
    pnl_pct: Number(row.pnl_pct) || 0,
    capital: Number(row.capital) || 0,
    trades_executed: Number(row.trades_executed) || 0,
    icon: row.icon || tpl.icon || "◆",
    color: row.color || tpl.color || "#00ffee",
    strategy: row.strategy_name || tpl.name || row.template_id,
    deployedAtMs: new Date(row.deployed_at).getTime(),
    // Wave 1 chart fields — from /api/agents/dashboard/:address
    series: Array.isArray(row.series) ? row.series : [],
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    drawdown_pct: row.drawdown_pct != null ? Number(row.drawdown_pct) : null,
    // Wave 2 — recent trades for scatter chart
    trades: Array.isArray(row.trades) ? row.trades : [],
  };
};

// ─── Atoms ──────────────────────────────────────────────────────────────────
function ScanlineOverlay() {
  return <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "repeating-linear-gradient(0deg, rgba(0,255,238,0.02) 0px, rgba(0,255,238,0.02) 1px, transparent 1px, transparent 3px)", opacity: 0.6 }} />;
}

function StatusDot({ status, size = 8 }) {
  const colors = { running: "#00ff88", paused: "#ff9500", stopped: "#ff2d92" };
  const c = colors[status] || "#6a6a82";
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: c, boxShadow: `0 0 ${size * 1.5}px ${c}` }} />
      {status === "running" && <span style={{ position: "absolute", inset: -4, borderRadius: "50%", border: `1px solid ${c}`, opacity: 0, animation: "pulse-ring 2s ease-out infinite" }} />}
    </span>
  );
}

function TierBadge({ tier }) {
  const meta = TIER_META[tier] || TIER_META[0];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", fontFamily: '"JetBrains Mono", monospace', color: meta.color, background: `linear-gradient(90deg, transparent, ${meta.glow})`, border: `1px solid ${meta.color}`, textShadow: `0 0 8px ${meta.glow}` }}>
      <span style={{ width: 4, height: 4, background: meta.color, borderRadius: "50%", boxShadow: `0 0 6px ${meta.color}` }} />
      {meta.name}
    </span>
  );
}

function ModeBadge({ mode }) {
  const isLive = mode === "live";
  const color = isLive ? "#ff2d92" : "#00ffee";
  return (
    <span style={{ padding: "2px 7px", fontSize: 8, fontWeight: 700, letterSpacing: "0.18em", fontFamily: '"JetBrains Mono", monospace', color, border: `1px solid ${color}`, background: `${color}0f` }}>
      {isLive ? "▲ LIVE" : "◊ PAPER"}
    </span>
  );
}

function GlowButton({ children, onClick, disabled, color = "#00ffee", variant = "solid", size = "md", style = {} }) {
  const sizes = { sm: { padding: "6px 14px", fontSize: 10 }, md: { padding: "10px 20px", fontSize: 11 }, lg: { padding: "14px 28px", fontSize: 13 } };
  const s = sizes[size];
  if (variant === "ghost") {
    return (
      <button onClick={onClick} disabled={disabled} style={{ ...s, background: "transparent", color, border: `1px solid ${color}`, cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "0.12em", fontWeight: 600, fontFamily: '"JetBrains Mono", monospace', textTransform: "uppercase", opacity: disabled ? 0.3 : 1, transition: "all 0.2s", ...style }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = `${color}15`; e.currentTarget.style.boxShadow = `0 0 20px ${color}40`; } }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "none"; }}>
        {children}
      </button>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...s, background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: "#000", border: "none", cursor: disabled ? "not-allowed" : "pointer", letterSpacing: "0.12em", fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', textTransform: "uppercase", boxShadow: `0 0 20px ${color}60`, opacity: disabled ? 0.3 : 1, transition: "all 0.2s", ...style }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.boxShadow = `0 0 35px ${color}`; e.currentTarget.style.transform = "translateY(-1px)"; } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 20px ${color}60`; e.currentTarget.style.transform = "translateY(0)"; }}>
      {children}
    </button>
  );
}

function TypedText({ text, speed = 30 }) {
  const [display, setDisplay] = useState("");
  useEffect(() => {
    setDisplay("");
    let i = 0;
    const iv = setInterval(() => { if (i <= text.length) { setDisplay(text.slice(0, i)); i++; } else clearInterval(iv); }, speed);
    return () => clearInterval(iv);
  }, [text, speed]);
  return <span>{display}<span style={{ opacity: display.length < text.length ? 1 : 0 }}>▊</span></span>;
}

function CornerBrackets({ color }) {
  const size = 10;
  const b = { position: "absolute", width: size, height: size, borderColor: color, borderStyle: "solid", borderWidth: 0 };
  return (
    <>
      <span style={{ ...b, top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 }} />
      <span style={{ ...b, top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 }} />
      <span style={{ ...b, bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 }} />
      <span style={{ ...b, bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 }} />
    </>
  );
}

function Metric({ label, value, sub, color = "#dcdce5" }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: '"JetBrains Mono", monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color, opacity: 0.7, fontFamily: '"JetBrains Mono", monospace', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────────────
function HeroStats({ subscription, agents }) {
  const meta = TIER_META[subscription?.tier ?? 0];
  const running = agents.filter(a => a.status === "running").length;
  const totalPnl = agents.reduce((sum, a) => sum + (a.pnl || 0), 0);

  return (
    <div style={{ position: "relative", padding: "28px 32px", marginBottom: 20, background: "linear-gradient(135deg, rgba(0,20,30,0.9) 0%, rgba(10,5,25,0.9) 100%)", border: "1px solid rgba(0,255,238,0.2)", overflow: "hidden" }}>
      <ScanlineOverlay />
      <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(0,255,238,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,238,0.04) 1px, transparent 1px)`, backgroundSize: "24px 24px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: -100, right: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(255,45,146,0.15), transparent)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -100, left: -100, width: 300, height: 300, background: "radial-gradient(circle, rgba(0,255,238,0.15), transparent)", pointerEvents: "none" }} />
      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "#00ffee", fontFamily: '"JetBrains Mono", monospace', marginBottom: 10, textShadow: "0 0 8px rgba(0,255,238,0.6)" }}>
            [ SYS_STATUS: ONLINE ]
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, letterSpacing: "-0.02em", fontFamily: '"JetBrains Mono", monospace', background: "linear-gradient(135deg, #00ffee 0%, #ff2d92 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            AGENTFORGE
          </h1>
          <div style={{ fontSize: 11, color: "#8a8a9e", fontFamily: '"JetBrains Mono", monospace', marginTop: 4 }}>
            <TypedText text="autonomous on-chain agents · base mainnet · paper mode" speed={25} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
          <StatPill label="ACTIVE" value={running} total={agents.length} color="#00ff88" />
          <StatPill label="TOTAL_PNL" value={fmtUsd(totalPnl)} color={totalPnl >= 0 ? "#00ff88" : "#ff2d92"} mono />
          <StatPill label="TIER" custom={<TierBadge tier={subscription?.tier ?? 0} />} />
          <StatPill label="SLOTS" value={`${agents.length}/${meta.allowed}`} color="#00ffee" mono />
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, total, color = "#dcdce5", mono, custom }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>{label}</span>
      {custom || (
        <span style={{ fontSize: 20, fontWeight: 700, color, fontFamily: mono ? '"JetBrains Mono", monospace' : "inherit", textShadow: color !== "#dcdce5" ? `0 0 12px ${color}60` : "none" }}>
          {value}{total != null && <span style={{ fontSize: 13, color: "#6a6a82" }}> / {total}</span>}
        </span>
      )}
    </div>
  );
}

function SubscriptionCard({ subscription, isAllowlisted, onUpgrade }) {
  const tier = subscription?.tier ?? 0;
  const meta = TIER_META[tier];
  const nextTier = TIER_META[tier + 1];
  return (
    <div style={{ position: "relative", padding: 22, background: "#07070d", border: `1px solid ${meta.color}44`, overflow: "hidden", marginBottom: 20 }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 6 }}>ACTIVE SUBSCRIPTION</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <TierBadge tier={tier} />
            <span style={{ fontSize: 11, color: "#8a8a9e", fontFamily: '"JetBrains Mono", monospace' }}>
              {meta.allowed} agents · ${meta.priceUsd}/mo
            </span>
            {isAllowlisted && (
              <span style={{ padding: "3px 8px", fontSize: 9, letterSpacing: "0.15em", fontFamily: '"JetBrains Mono", monospace', color: "#ff2d92", border: "1px solid #ff2d92", background: "rgba(255,45,146,0.08)" }}>
                ▲ LIVE_MODE_AUTHORIZED
              </span>
            )}
          </div>
        </div>
        {nextTier && (
          <GlowButton onClick={onUpgrade} color={nextTier.color} size="sm">
            UPGRADE → {nextTier.name} (${nextTier.priceUsd}/mo)
          </GlowButton>
        )}
      </div>
    </div>
  );
}

// ─── Wave 1 chart components ───────────────────────────────────────────────
// Compact telemetry visualizations matching the AgentForge sci-fi palette.
// Drop in inside AgentCard after the existing metric row.

function confidenceColor(score) {
  if (score == null) return "#6a6a82";
  if (score >= 70) return "#00ff88";
  if (score >= 40) return "#ff9500";
  return "#ff2d92";
}
function confidenceLabel(score) {
  if (score == null) return "—";
  if (score >= 70) return "HEALTHY";
  if (score >= 40) return "CAUTION";
  return "UNHEALTHY";
}

function ChartTooltip({ active, payload, accentColor }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = d.recorded_at ? new Date(d.recorded_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div style={{
      background: "rgba(5,5,12,0.95)",
      border: `1px solid ${accentColor}66`,
      padding: "6px 10px",
      fontSize: 10,
      fontFamily: '"JetBrains Mono", monospace',
      color: "#dcdce5",
    }}>
      {time && <div style={{ color: "#6a6a82", marginBottom: 2 }}>{time}</div>}
      {d.pnl !== undefined && <div>pnl: <span style={{ color: d.pnl >= 0 ? "#00ff88" : "#ff2d92" }}>{fmtUsd(d.pnl)}</span></div>}
      {d.confidence_score !== undefined && <div>conf: <span style={{ color: confidenceColor(d.confidence_score) }}>{d.confidence_score}</span></div>}
      {d.drawdown_pct !== undefined && <div>dd: <span style={{ color: "#ff2d92" }}>{Number(d.drawdown_pct).toFixed(2)}%</span></div>}
    </div>
  );
}

function EquitySparkline({ series, color }) {
  const data = (series || []).filter(p => p.recorded_at);
  if (data.length < 2) return (
    <div style={{ height: 50, display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed rgba(0,255,238,0.15)", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: "#6a6a82", letterSpacing: "0.1em" }}>
      [ COLLECTING_TELEMETRY ]
    </div>
  );
  const lastPnl = Number(data[data.length - 1].pnl) || 0;
  const lineColor = lastPnl >= 0 ? "#00ff88" : "#ff2d92";
  return (
    <ResponsiveContainer width="100%" height={50}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <ReferenceLine y={0} stroke="#6a6a82" strokeDasharray="2 2" strokeOpacity={0.5} />
        <Tooltip content={<ChartTooltip accentColor={color} />} cursor={{ stroke: color, strokeOpacity: 0.3, strokeDasharray: "2 2" }} />
        <Line type="monotone" dataKey="pnl" stroke={lineColor} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ConfidenceMini({ series, currentScore, color }) {
  const data = (series || []).filter(p => p.recorded_at && p.confidence_score != null);
  const cc = confidenceColor(currentScore);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em" }}>CONFIDENCE</span>
        <span style={{ fontSize: 9, color: cc, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700, letterSpacing: "0.1em" }}>
          {currentScore != null ? currentScore : "—"} · {confidenceLabel(currentScore)}
        </span>
      </div>
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={28}>
          <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={`conf-grad-${currentScore}-${data.length}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cc} stopOpacity={0.5} />
                <stop offset="100%" stopColor={cc} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 100]} />
            <ReferenceLine y={70} stroke="#00ff88" strokeDasharray="1 3" strokeOpacity={0.3} />
            <ReferenceLine y={40} stroke="#ff2d92" strokeDasharray="1 3" strokeOpacity={0.3} />
            <Tooltip content={<ChartTooltip accentColor={color} />} cursor={false} />
            <Area type="monotone" dataKey="confidence_score" stroke={cc} fill={`url(#conf-grad-${currentScore}-${data.length})`} strokeWidth={1} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 28, display: "flex", alignItems: "center", fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>—</div>
      )}
    </div>
  );
}

function DrawdownMini({ series, currentDd, color }) {
  const data = (series || []).filter(p => p.recorded_at && p.drawdown_pct != null);
  const ddColor = currentDd != null && currentDd <= -5 ? "#ff2d92" : "#ff9500";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em" }}>DRAWDOWN</span>
        <span style={{ fontSize: 9, color: currentDd != null && currentDd < 0 ? ddColor : "#dcdce5", fontFamily: '"JetBrains Mono", monospace', fontWeight: 700 }}>
          {currentDd != null ? `${currentDd.toFixed(2)}%` : "—"}
        </span>
      </div>
      {data.length > 1 ? (
        <ResponsiveContainer width="100%" height={28}>
          <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <defs>
              <linearGradient id={`dd-grad-${data.length}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff2d92" stopOpacity={0} />
                <stop offset="100%" stopColor="#ff2d92" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", 0]} />
            <Tooltip content={<ChartTooltip accentColor={color} />} cursor={false} />
            <Area type="monotone" dataKey="drawdown_pct" stroke="#ff2d92" fill={`url(#dd-grad-${data.length})`} strokeWidth={1} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 28, display: "flex", alignItems: "center", fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>—</div>
      )}
    </div>
  );
}

// ─── Time range selector ─────────────────────────────────────────────────
function RangePicker({ range, onChange }) {
  const options = [
    { value: "24h", label: "24H" },
    { value: "7d",  label: "7D" },
    { value: "30d", label: "30D" },
    { value: "all", label: "ALL" },
  ];
  return (
    <div style={{ display: "flex", gap: 0, border: "1px solid rgba(0,255,238,0.2)" }}>
      {options.map(opt => {
        const active = range === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "6px 12px",
              fontSize: 10,
              fontFamily: '"JetBrains Mono", monospace',
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: active ? "rgba(0,255,238,0.15)" : "transparent",
              color: active ? "#00ffee" : "#6a6a82",
              border: "none",
              borderRight: opt.value !== "all" ? "1px solid rgba(0,255,238,0.15)" : "none",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.color = "#dcdce5"; }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.color = "#6a6a82"; }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Wave 2: Portfolio allocation donut ────────────────────────────────────
// Shows capital distribution across agents. Sits below HeroStats / above
// SubscriptionCard. Uses agent.color for slice colors so each slice matches
// the corresponding AgentCard. Only renders when there are 2+ active agents
// (a single-agent donut is silly).

function AllocationDonut({ agents }) {
  // Filter agents with capital, sort by capital desc so the biggest slices
  // come first in the legend (and at 12 o'clock in the donut)
  const data = (agents || [])
    .filter(a => a && (Number(a.capital) || 0) > 0)
    .map(a => ({
      id: a.id,
      name: a.name,
      strategy: a.strategy,
      capital: Number(a.capital) || 0,
      color: a.color || "#00ffee",
      pnl: Number(a.pnl) || 0,
      status: a.status,
    }))
    .sort((a, b) => b.capital - a.capital);

  if (data.length < 2) return null;

  const totalCapital = data.reduce((s, d) => s + d.capital, 0);
  const totalPnl = data.reduce((s, d) => s + d.pnl, 0);
  const totalPnlPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;
  const pnlColor = totalPnl >= 0 ? "#00ff88" : "#ff2d92";

  return (
    <div style={{
      position: "relative",
      padding: "20px 32px",
      marginBottom: 20,
      background: "linear-gradient(135deg, rgba(0,15,25,0.85) 0%, rgba(8,5,20,0.85) 100%)",
      border: "1px solid rgba(0,255,238,0.15)",
      overflow: "hidden",
    }}>
      <ScanlineOverlay />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        {/* Donut + center label, both inside a relative wrapper so the label
            is centered over the SVG regardless of outer flex layout */}
        <div style={{ position: "relative", width: 180, height: 180, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="capital"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={84}
                paddingAngle={2}
                strokeWidth={0}
                isAnimationActive={false}
              >
                {data.map((d) => <Cell key={d.id} fill={d.color} />)}
              </Pie>
              <Tooltip content={<DonutTooltip total={totalCapital} />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center overlay — absolutely positioned inside the donut wrapper,
              flex-centered so it stays put regardless of viewport */}
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: 8,
              color: "#6a6a82",
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: "0.15em",
            }}>
              TOTAL
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#dcdce5",
              fontFamily: '"JetBrains Mono", monospace',
              marginTop: 1,
            }}>
              {fmtUsd(totalCapital)}
            </div>
            <div style={{
              width: 32,
              height: 1,
              background: "rgba(0,255,238,0.2)",
              margin: "5px 0",
            }} />
            <div style={{
              fontSize: 8,
              color: "#6a6a82",
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: "0.15em",
            }}>
              NET_PNL
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: pnlColor,
              fontFamily: '"JetBrains Mono", monospace',
              marginTop: 1,
              textShadow: `0 0 8px ${pnlColor}40`,
            }}>
              {fmtUsd(totalPnl)}
            </div>
            <div style={{
              fontSize: 9,
              color: pnlColor,
              fontFamily: '"JetBrains Mono", monospace',
              opacity: 0.7,
              marginTop: 1,
            }}>
              {fmtPct(totalPnlPct)}
            </div>
          </div>
        </div>

        {/* Legend / breakdown */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 10,
          }}>
            <span style={{ fontSize: 10, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.15em" }}>
              CAPITAL_ALLOCATION
            </span>
            <span style={{ fontSize: 9, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.1em" }}>
              {data.length} ACTIVE_POSITIONS
            </span>
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: "8px 18px",
          }}>
            {data.map((d) => {
              const pct = totalCapital > 0 ? (d.capital / totalCapital) * 100 : 0;
              const dPnlColor = d.pnl > 0 ? "#00ff88" : d.pnl < 0 ? "#ff2d92" : "#6a6a82";
              return (
                <div key={d.id} style={{
                  display: "grid",
                  gridTemplateColumns: "10px 1fr auto auto",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    background: d.color,
                    boxShadow: `0 0 6px ${d.color}80`,
                  }} />
                  <span style={{
                    color: "#dcdce5",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {d.name}
                  </span>
                  <span style={{ color: "#6a6a82", fontSize: 10 }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span style={{ color: dPnlColor, fontSize: 10, fontWeight: 600, minWidth: 60, textAlign: "right" }}>
                    {fmtUsd(d.pnl)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DonutTooltip({ active, payload, total }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? (d.capital / total) * 100 : 0;
  return (
    <div style={{
      background: "rgba(5,5,12,0.95)",
      border: `1px solid ${d.color}80`,
      padding: "8px 12px",
      fontSize: 11,
      fontFamily: '"JetBrains Mono", monospace',
      color: "#dcdce5",
    }}>
      <div style={{ color: d.color, fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: "#6a6a82", fontSize: 9, marginBottom: 6, letterSpacing: "0.1em" }}>{d.strategy}</div>
      <div>capital: {fmtUsd(d.capital)} <span style={{ color: "#6a6a82" }}>({pct.toFixed(1)}%)</span></div>
      <div>pnl: <span style={{ color: d.pnl >= 0 ? "#00ff88" : "#ff2d92" }}>{fmtUsd(d.pnl)}</span></div>
    </div>
  );
}

// ─── Wave 2: Trade scatter ────────────────────────────────────────────────
// Per-trade pnl_delta plotted over time. Each dot is one trade. Green for
// profitable, magenta for losses. Sized by trade magnitude.

function TradeScatter({ trades, color }) {
  const data = (trades || [])
    .filter(t => t && t.executed_at)
    .map(t => ({
      time: new Date(t.executed_at).getTime(),
      pnl: Number(t.pnl_delta) || 0,
      // Real schema uses `side` (buy/sell/accrue), not action_type
      side: t.side || "trade",
      mode: t.mode || "paper",
      asset_in: t.asset_in,
      asset_out: t.asset_out,
      // Bubble size — scales with absolute pnl
      size: Math.max(20, Math.min(120, Math.abs(Number(t.pnl_delta) || 0) * 4)),
    }));

  if (data.length < 1) return (
    <div style={{
      height: 60, display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px dashed rgba(0,255,238,0.15)",
      fontSize: 9, fontFamily: '"JetBrains Mono", monospace',
      color: "#6a6a82", letterSpacing: "0.1em",
    }}>
      [ NO_TRADES_YET ]
    </div>
  );

  const greens = data.filter(d => d.pnl >= 0);
  const reds   = data.filter(d => d.pnl < 0);

  return (
    <ResponsiveContainer width="100%" height={60}>
      <ScatterChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <XAxis type="number" dataKey="time" hide domain={["dataMin", "dataMax"]} />
        <YAxis type="number" dataKey="pnl" hide domain={["dataMin - 1", "dataMax + 1"]} />
        <ZAxis type="number" dataKey="size" range={[20, 120]} />
        <ReferenceLine y={0} stroke="#6a6a82" strokeDasharray="2 2" strokeOpacity={0.5} />
        <Tooltip content={<ScatterTooltip />} cursor={false} />
        {greens.length > 0 && (
          <Scatter data={greens} fill="#00ff88" fillOpacity={0.7} stroke="#00ff88" strokeWidth={1} />
        )}
        {reds.length > 0 && (
          <Scatter data={reds} fill="#ff2d92" fillOpacity={0.7} stroke="#ff2d92" strokeWidth={1} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ScatterTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const time = new Date(d.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sideColor = d.side === "buy" ? "#00ff88" : d.side === "sell" ? "#ff9500" : "#00ffee";
  const pair = d.asset_in && d.asset_out ? `${d.asset_in}→${d.asset_out}` : "";
  return (
    <div style={{
      background: "rgba(5,5,12,0.95)",
      border: `1px solid ${d.pnl >= 0 ? "#00ff88" : "#ff2d92"}80`,
      padding: "6px 10px",
      fontSize: 10,
      fontFamily: '"JetBrains Mono", monospace',
      color: "#dcdce5",
    }}>
      <div style={{ color: "#6a6a82", marginBottom: 2 }}>{time}</div>
      <div><span style={{ color: sideColor, fontWeight: 700 }}>{d.side}</span>{pair && <span style={{ color: "#6a6a82" }}> {pair}</span>}</div>
      <div>pnl: <span style={{ color: d.pnl >= 0 ? "#00ff88" : "#ff2d92" }}>{fmtUsd(d.pnl)}</span> <span style={{ color: "#6a6a82", fontSize: 9 }}>· {d.mode}</span></div>
    </div>
  );
}

// ─── S3: Policy violations badge ──────────────────────────────────────────
// Polls /api/agents/:id/violations every 60s. Shows count in last 24h.
// Hidden when zero. Click → opens the policy modal scrolled to History tab.

function ViolationsBadge({ agentId, apiUrl, onClick }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!agentId || !apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/api/agents/${agentId}/violations?limit=200`);
      if (!res.ok) return;
      const data = await res.json();
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recent = (data.violations || []).filter(v =>
        v?.recorded_at && new Date(v.recorded_at).getTime() > cutoff
      );
      setCount(recent.length);
    } catch (err) {
      // Silent — badge just stays at last known value
    }
  }, [agentId, apiUrl]);

  useEffect(() => {
    refresh();
    const handle = setInterval(refresh, 60_000);
    return () => clearInterval(handle);
  }, [refresh]);

  if (count <= 0) return null;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
      title={`${count} policy violation${count === 1 ? '' : 's'} in last 24h — click to view`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        background: "rgba(255,45,146,0.15)",
        border: "1px solid #ff2d92",
        color: "#ff2d92",
        fontSize: 9,
        fontFamily: '"JetBrains Mono", monospace',
        fontWeight: 700,
        letterSpacing: "0.1em",
        cursor: "pointer",
        textShadow: "0 0 6px rgba(255,45,146,0.6)",
      }}
    >
      <span>⚠</span>
      <span>{count} VIOLATION{count === 1 ? '' : 'S'}</span>
    </button>
  );
}

// ─── S3: Edit Policy modal ────────────────────────────────────────────────
// Three tabs: Authorization (read-only CDP info) / Risk dials (editable) /
// History (prior versions). PUT to /api/agents/:id/policy creates v(N+1).

function EditPolicyModal({ open, agent, apiUrl, ownerWallet, initialTab = "risk", onClose, onSaved }) {
  const [tab, setTab] = useState(initialTab);
  const [policy, setPolicy] = useState(null);
  const [history, setHistory] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [edits, setEdits] = useState({});

  // Reset tab when modal reopens
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // Load active policy + history + violations on open
  useEffect(() => {
    if (!open || !agent || !apiUrl) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [pRes, hRes, vRes] = await Promise.all([
          fetch(`${apiUrl}/api/agents/${agent.id}/policy`),
          fetch(`${apiUrl}/api/agents/${agent.id}/policy/history`),
          fetch(`${apiUrl}/api/agents/${agent.id}/violations?limit=50`),
        ]);
        const pData = pRes.ok ? await pRes.json() : { policy: null };
        const hData = hRes.ok ? await hRes.json() : { versions: [] };
        const vData = vRes.ok ? await vRes.json() : { violations: [] };
        if (cancelled) return;
        setPolicy(pData.policy);
        setHistory(hData.versions || []);
        setViolations(vData.violations || []);
        setEdits({}); // reset edits on reload
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, agent, apiUrl]);

  const fieldVal = (key) => {
    if (key in edits) return edits[key];
    if (!policy) return "";
    const v = policy[key];
    return v == null ? "" : v;
  };

  const setEdit = (key, value) => {
    setEdits(prev => ({ ...prev, [key]: value }));
  };

  const hasEdits = Object.keys(edits).length > 0;

  const handleSave = async () => {
    if (!hasEdits) return;
    setSaving(true);
    setError(null);
    try {
      // Coerce numeric fields
      const numericKeys = [
        "max_trade_size_usd", "max_daily_volume_usd", "max_gas_gwei",
        "slippage_tolerance_bps", "daily_loss_cap_pct", "lifetime_loss_cap_pct",
        "profit_lock_threshold_pct", "profit_lock_skim_pct",
        "drawdown_trailing_stop_pct", "min_confidence_score",
        "max_eth_value_per_tx",
      ];
      const body = {};
      for (const [k, v] of Object.entries(edits)) {
        if (v === "" || v == null) {
          body[k] = null;
        } else if (numericKeys.includes(k)) {
          const n = Number(v);
          body[k] = Number.isFinite(n) ? n : null;
        } else {
          body[k] = v;
        }
      }
      const res = await fetch(`${apiUrl}/api/agents/${agent.id}/policy`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Wallet-Address": ownerWallet,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`PUT /policy → ${res.status}: ${t}`);
      }
      const data = await res.json();
      setPolicy(data.policy);
      setEdits({});
      // Reload history so the new version appears
      const hRes = await fetch(`${apiUrl}/api/agents/${agent.id}/policy/history`);
      if (hRes.ok) {
        const hData = await hRes.json();
        setHistory(hData.versions || []);
      }
      if (onSaved) onSaved(data.policy);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open || !agent) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, rgba(10,10,18,0.98) 0%, rgba(5,5,12,0.98) 100%)",
          border: `1px solid ${agent.color}80`,
          boxShadow: `0 0 40px ${agent.color}40`,
          position: "relative",
        }}
      >
        <ScanlineOverlay />
        <CornerBrackets color={agent.color} />

        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 9, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.15em" }}>EDIT_POLICY</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: agent.color, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em", marginTop: 2 }}>
              {agent.name}
              {policy && <span style={{ color: "#6a6a82", fontWeight: 400, marginLeft: 10, fontSize: 11 }}>· v{policy.version}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid #6a6a82", color: "#6a6a82",
              fontSize: 18, padding: "2px 10px", cursor: "pointer",
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: "1px solid #1a1a2e" }}>
          {[
            { id: "auth", label: "AUTHORIZATION" },
            { id: "risk", label: "RISK_DIALS" },
            { id: "history", label: "HISTORY" },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "12px 16px",
                background: tab === t.id ? `${agent.color}15` : "transparent",
                border: "none",
                borderBottom: `2px solid ${tab === t.id ? agent.color : "transparent"}`,
                color: tab === t.id ? agent.color : "#6a6a82",
                fontSize: 10,
                fontWeight: 700,
                fontFamily: '"JetBrains Mono", monospace',
                letterSpacing: "0.15em",
                cursor: "pointer",
              }}
            >{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", position: "relative" }}>
          {loading && (
            <div style={{ color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', fontSize: 11, letterSpacing: "0.1em" }}>
              [ LOADING_POLICY... ]
            </div>
          )}

          {error && (
            <div style={{ padding: 12, marginBottom: 16, border: "1px solid #ff2d92", background: "rgba(255,45,146,0.1)", color: "#ff2d92", fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>
              ERROR: {error}
            </div>
          )}

          {!loading && policy && tab === "auth" && (
            <PolicyTabAuth policy={policy} agent={agent} />
          )}

          {!loading && policy && tab === "risk" && (
            <PolicyTabRisk
              policy={policy}
              fieldVal={fieldVal}
              setEdit={setEdit}
              edits={edits}
              accentColor={agent.color}
            />
          )}

          {!loading && tab === "history" && (
            <PolicyTabHistory history={history} violations={violations} accentColor={agent.color} />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #1a1a2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.1em" }}>
            {hasEdits ? `${Object.keys(edits).length} UNSAVED CHANGE${Object.keys(edits).length === 1 ? '' : 'S'}` : "NO_PENDING_CHANGES"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <GlowButton onClick={onClose} color="#6a6a82" variant="ghost" size="sm">CANCEL</GlowButton>
            {tab === "risk" && (
              <GlowButton
                onClick={handleSave}
                color={agent.color}
                variant="solid"
                size="sm"
                disabled={!hasEdits || saving}
              >
                {saving ? "SAVING..." : `SAVE → v${(policy?.version || 0) + 1}`}
              </GlowButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Authorization tab — read-only CDP info ──────────────────────────────
function PolicyTabAuth({ policy, agent }) {
  const protocols = Array.isArray(policy.allowed_protocols) ? policy.allowed_protocols : [];
  return (
    <div style={{ fontFamily: '"JetBrains Mono", monospace' }}>
      <div style={{ fontSize: 9, color: "#6a6a82", letterSpacing: "0.15em", marginBottom: 8 }}>CDP_LAYER</div>
      <div style={{ padding: 14, border: "1px solid #1a1a2e", marginBottom: 16, background: "rgba(0,0,0,0.3)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 11 }}>
          <span style={{ color: "#6a6a82" }}>cdp_account:</span>
          <span style={{ color: "#dcdce5", wordBreak: "break-all" }}>
            {policy.cdp_account_address || <em style={{ color: "#6a6a82" }}>not yet provisioned (lazy on first LIVE trade)</em>}
          </span>
          <span style={{ color: "#6a6a82" }}>cdp_policy_id:</span>
          <span style={{ color: "#dcdce5", wordBreak: "break-all" }}>
            {policy.cdp_policy_id || <em style={{ color: "#6a6a82" }}>not yet provisioned</em>}
          </span>
          <span style={{ color: "#6a6a82" }}>max_eth_value:</span>
          <span style={{ color: "#dcdce5" }}>{policy.max_eth_value_per_tx || 0} ETH per tx</span>
        </div>
      </div>

      <div style={{ fontSize: 9, color: "#6a6a82", letterSpacing: "0.15em", marginBottom: 8 }}>ALLOWED_PROTOCOLS</div>
      <div style={{ padding: 14, border: "1px solid #1a1a2e", background: "rgba(0,0,0,0.3)" }}>
        {protocols.length === 0 ? (
          <div style={{ fontSize: 11, color: "#6a6a82" }}>
            <em>No protocols allowlisted. This agent cannot make LIVE trades until protocols are added.</em>
            <div style={{ marginTop: 8, fontSize: 10 }}>
              Protocols are added when the agent's strategy connects to a router (S4 Aerodrome, S5 Uniswap, S6 Aggregator).
            </div>
          </div>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {protocols.map((p, i) => (
              <li key={i} style={{ fontSize: 11, color: "#dcdce5", wordBreak: "break-all", padding: "4px 0", borderBottom: i < protocols.length - 1 ? "1px solid #0f0f1a" : "none" }}>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: 10, color: "#6a6a82", lineHeight: 1.6 }}>
        Authorization is enforced at sign-time inside Coinbase's Nitro Enclave.
        Even a buggy strategy cannot exceed these limits — they are checked before
        any signature is produced. The risk dials in the next tab add a second
        layer of protection that runs in our backend before signing.
      </div>
    </div>
  );
}

// ─── Risk dials tab — editable form ──────────────────────────────────────
function PolicyTabRisk({ policy, fieldVal, setEdit, edits, accentColor }) {
  const fields = [
    {
      group: "Trade limits",
      items: [
        { key: "max_trade_size_usd", label: "Max trade size (USD)", suffix: "USD", type: "number", step: 1, min: 0 },
        { key: "max_daily_volume_usd", label: "Max daily volume (USD)", suffix: "USD", type: "number", step: 10, min: 0 },
        { key: "max_gas_gwei", label: "Max gas price", suffix: "gwei", type: "number", step: 1, min: 1 },
        { key: "slippage_tolerance_bps", label: "Slippage tolerance", suffix: "bps", type: "number", step: 5, min: 0, hint: "Live trades only — paper engines don't model slippage" },
      ],
    },
    {
      group: "Loss limits (negative = loss)",
      items: [
        { key: "daily_loss_cap_pct", label: "Daily loss cap", suffix: "%", type: "number", step: 0.5 },
        { key: "lifetime_loss_cap_pct", label: "Lifetime loss cap", suffix: "%", type: "number", step: 0.5 },
        { key: "drawdown_trailing_stop_pct", label: "Drawdown trailing stop", suffix: "% from peak", type: "number", step: 0.5, min: 0, allowEmpty: true, hint: "Empty = no trailing stop" },
      ],
    },
    {
      group: "Profit lock (virtual / bookkeeping in S3)",
      items: [
        { key: "profit_lock_threshold_pct", label: "Profit lock threshold", suffix: "% pnl", type: "number", step: 1, min: 0, allowEmpty: true, hint: "Empty = no profit lock for this strategy" },
        { key: "profit_lock_skim_pct", label: "Skim percentage when locked", suffix: "% of profit", type: "number", step: 5, min: 0, max: 100 },
      ],
    },
    {
      group: "Other",
      items: [
        { key: "min_confidence_score", label: "Min confidence score", suffix: "/ 100", type: "number", step: 5, min: 0, max: 100, hint: "Below this, agent logs a warning (does not halt)" },
        { key: "notes", label: "Notes (free-form)", type: "text" },
      ],
    },
  ];

  return (
    <div style={{ fontFamily: '"JetBrains Mono", monospace' }}>
      {fields.map((group, gi) => (
        <div key={gi} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, color: "#6a6a82", letterSpacing: "0.15em", marginBottom: 8, textTransform: "uppercase" }}>{group.group}</div>
          <div style={{ padding: 14, border: "1px solid #1a1a2e", background: "rgba(0,0,0,0.3)" }}>
            {group.items.map((field, fi) => {
              const isEdited = field.key in edits;
              return (
                <div key={field.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: fi < group.items.length - 1 ? "1px solid #0f0f1a" : "none" }}>
                  <div>
                    <label style={{ fontSize: 11, color: "#dcdce5", display: "block" }}>
                      {field.label}
                      {isEdited && <span style={{ color: accentColor, marginLeft: 6, fontSize: 9 }}>● edited</span>}
                    </label>
                    {field.hint && (
                      <div style={{ fontSize: 9, color: "#6a6a82", marginTop: 2 }}>{field.hint}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type={field.type}
                      step={field.step}
                      min={field.min}
                      max={field.max}
                      value={fieldVal(field.key)}
                      onChange={(e) => setEdit(field.key, e.target.value)}
                      style={{
                        width: field.type === "text" ? 220 : 100,
                        padding: "6px 8px",
                        background: "rgba(0,0,0,0.5)",
                        border: `1px solid ${isEdited ? accentColor : "#1a1a2e"}`,
                        color: "#dcdce5",
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 11,
                        textAlign: field.type === "number" ? "right" : "left",
                        outline: "none",
                      }}
                    />
                    {field.suffix && (
                      <span style={{ fontSize: 9, color: "#6a6a82", minWidth: 60 }}>{field.suffix}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── History tab — version list + recent violations ───────────────────────
function PolicyTabHistory({ history, violations, accentColor }) {
  return (
    <div style={{ fontFamily: '"JetBrains Mono", monospace' }}>
      <div style={{ fontSize: 9, color: "#6a6a82", letterSpacing: "0.15em", marginBottom: 8 }}>VERSIONS ({history.length})</div>
      <div style={{ marginBottom: 20 }}>
        {history.length === 0 ? (
          <div style={{ padding: 14, border: "1px solid #1a1a2e", color: "#6a6a82", fontSize: 11, fontStyle: "italic" }}>
            No policy versions found.
          </div>
        ) : (
          history.map((v, i) => (
            <div key={v.id} style={{ padding: 12, marginBottom: 8, border: `1px solid ${v.is_active ? accentColor : "#1a1a2e"}`, background: "rgba(0,0,0,0.3)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: v.is_active ? accentColor : "#dcdce5" }}>
                  v{v.version}
                  {v.is_active && <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 6px", background: accentColor, color: "#000", letterSpacing: "0.1em" }}>ACTIVE</span>}
                </span>
                <span style={{ fontSize: 9, color: "#6a6a82" }}>
                  {new Date(v.created_at).toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#6a6a82", marginBottom: 6 }}>
                by <span style={{ color: "#dcdce5" }}>{v.created_by?.slice(0, 10)}…{v.created_by?.slice(-6)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "4px 12px", fontSize: 10 }}>
                <span style={{ color: "#6a6a82" }}>max_trade: <span style={{ color: "#dcdce5" }}>${v.max_trade_size_usd}</span></span>
                <span style={{ color: "#6a6a82" }}>daily_cap: <span style={{ color: "#dcdce5" }}>{v.daily_loss_cap_pct}%</span></span>
                <span style={{ color: "#6a6a82" }}>lifetime_cap: <span style={{ color: "#dcdce5" }}>{v.lifetime_loss_cap_pct}%</span></span>
                <span style={{ color: "#6a6a82" }}>min_conf: <span style={{ color: "#dcdce5" }}>{v.min_confidence_score}</span></span>
              </div>
              {v.notes && (
                <div style={{ fontSize: 9, color: "#6a6a82", marginTop: 6, fontStyle: "italic" }}>"{v.notes}"</div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ fontSize: 9, color: "#6a6a82", letterSpacing: "0.15em", marginBottom: 8 }}>RECENT_VIOLATIONS ({violations.length})</div>
      {violations.length === 0 ? (
        <div style={{ padding: 14, border: "1px solid #1a1a2e", color: "#6a6a82", fontSize: 11, fontStyle: "italic" }}>
          No violations recorded.
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflow: "auto" }}>
          {violations.map((v) => (
            <div key={v.id} style={{ padding: 8, marginBottom: 4, border: `1px solid ${v.resulted_in_halt ? "#ff2d92" : "#1a1a2e"}`, background: "rgba(0,0,0,0.3)", fontSize: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ color: v.resulted_in_halt ? "#ff2d92" : "#ff9500", fontWeight: 700 }}>
                  {v.violation_type}
                  {v.resulted_in_halt && <span style={{ marginLeft: 6, fontSize: 8 }}>· HALT</span>}
                </span>
                <span style={{ color: "#6a6a82", fontSize: 9 }}>{new Date(v.recorded_at).toLocaleTimeString()}</span>
              </div>
              <div style={{ color: "#6a6a82", fontSize: 9 }}>
                attempted: <span style={{ color: "#dcdce5" }}>{v.attempted_value ?? "—"}</span>
                {" · "}
                policy: <span style={{ color: "#dcdce5" }}>{v.policy_value ?? "—"}</span>
                {" · "}
                layer: <span style={{ color: "#dcdce5" }}>{v.layer}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, onPause, onResume, onDelete, onInspect, onEditPolicy, onHalt, onUnhalt, apiUrl }) {
  const pnlColor = agent.pnl >= 0 ? "#00ff88" : "#ff2d92";
  const canToggle = agent.status !== "stopped";
  const deployedAgo = Math.floor((Date.now() - agent.deployedAtMs) / 60000);
  return (
    <div style={{ position: "relative", padding: 18, background: "linear-gradient(135deg, rgba(10,10,18,0.95) 0%, rgba(5,5,12,0.95) 100%)", border: `1px solid ${agent.color}33`, overflow: "hidden", cursor: "pointer", transition: "all 0.2s" }}
      onClick={() => onInspect(agent)}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${agent.color}80`; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = `${agent.color}33`; e.currentTarget.style.transform = "translateY(0)"; }}>
      <CornerBrackets color={agent.color} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: `${agent.color}15`, border: `1px solid ${agent.color}66`, fontSize: 16, color: agent.color, textShadow: `0 0 10px ${agent.color}` }}>{agent.icon}</div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em" }}>{agent.name}</span>
              <ModeBadge mode={agent.mode} />
            </div>
            <div style={{ fontSize: 9, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginTop: 2, letterSpacing: "0.1em" }}>{agent.strategy}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ViolationsBadge agentId={agent.id} apiUrl={apiUrl} onClick={() => onEditPolicy && onEditPolicy(agent, "history")} />
          <StatusDot status={agent.status} />
          <span style={{
            fontSize: 9,
            letterSpacing: "0.12em",
            color: agent.status === "running" ? "#00ff88"
                 : agent.status === "paused" ? "#ff9500"
                 : agent.status === "halted" ? "#ff2d92"
                 : "#ff2d92",
            fontFamily: '"JetBrains Mono", monospace',
            fontWeight: 600,
            textShadow: agent.status === "halted" ? "0 0 6px rgba(255,45,146,0.7)" : "none",
          }}>
            {agent.status.toUpperCase()}
          </span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12, padding: "10px 0", borderTop: "1px solid #1a1a2e", borderBottom: "1px solid #1a1a2e" }}>
        <Metric label="PNL" value={fmtUsd(agent.pnl)} sub={fmtPct(agent.pnl_pct)} color={pnlColor} />
        <Metric label="TRADES" value={agent.trades_executed} color="#00ffee" />
        <Metric label="CAPITAL" value={fmtUsd(agent.capital)} color="#dcdce5" />
      </div>

      {/* Wave 1 telemetry charts */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em" }}>EQUITY_CURVE</span>
          <span style={{ fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>{(agent.series || []).length} pts</span>
        </div>
        <EquitySparkline series={agent.series} color={agent.color} />
      </div>

      {/* Wave 2: Trade scatter */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em" }}>TRADE_SCATTER</span>
          <span style={{ fontSize: 8, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>{(agent.trades || []).length} trades</span>
        </div>
        <TradeScatter trades={agent.trades} color={agent.color} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <ConfidenceMini series={agent.series} currentScore={agent.confidence_score} color={agent.color} />
        <DrawdownMini series={agent.series} currentDd={agent.drawdown_pct} color={agent.color} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: "#6a6a82", letterSpacing: "0.05em" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ color: agent.color }}>▸</span> {agent.last_action || "—"}
        </span>
        <span>{deployedAgo < 1 ? "just now" : `${deployedAgo}m ago`}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
        {agent.status === "halted" ? (
          <GlowButton onClick={() => onUnhalt(agent.id)} color="#ff2d92" variant="ghost" size="sm" style={{ flex: 1 }}>UNHALT</GlowButton>
        ) : canToggle && (
          agent.status === "running"
            ? <GlowButton onClick={() => onPause(agent.id)} color="#ff9500" variant="ghost" size="sm" style={{ flex: 1 }}>PAUSE</GlowButton>
            : <GlowButton onClick={() => onResume(agent.id)} color="#00ff88" variant="ghost" size="sm" style={{ flex: 1 }}>RESUME</GlowButton>
        )}
        {agent.status !== "halted" && (
          <GlowButton onClick={() => onHalt(agent.id)} color="#ff2d92" variant="ghost" size="sm" style={{ flex: 1 }}>HALT</GlowButton>
        )}
        <GlowButton onClick={() => onEditPolicy && onEditPolicy(agent, "risk")} color="#a855f7" variant="ghost" size="sm" style={{ flex: 1 }}>POLICY</GlowButton>
        <GlowButton onClick={() => onInspect(agent)} color="#00ffee" variant="ghost" size="sm" style={{ flex: 1 }}>INSPECT</GlowButton>
        <GlowButton onClick={() => onDelete(agent.id)} color="#ff2d92" variant="ghost" size="sm" style={{ flex: 1 }}>TERMINATE</GlowButton>
      </div>
    </div>
  );
}

function RiskAgreementModal({ open, template, capital, mode, onSign, onCancel, signing }) {
  const [checks, setChecks] = useState({ risk: false, paper: false, liability: false });
  useEffect(() => { if (!open) setChecks({ risk: false, paper: false, liability: false }); }, [open]);
  if (!open) return null;
  const allChecked = Object.values(checks).every(Boolean);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, backdropFilter: "blur(10px)" }} onClick={onCancel}>
      <div style={{ position: "relative", width: "min(620px, 94vw)", maxHeight: "88vh", overflow: "auto", padding: 32, background: "linear-gradient(135deg, #1a0510 0%, #07070d 100%)", border: "1px solid rgba(255,45,146,0.5)", boxShadow: "0 0 80px rgba(255,45,146,0.2)" }} onClick={e => e.stopPropagation()}>
        <CornerBrackets color="#ff2d92" />
        <ScanlineOverlay />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "#ff2d92", fontFamily: '"JetBrains Mono", monospace', marginBottom: 4, textShadow: "0 0 10px rgba(255,45,146,0.6)" }}>
            [ MANDATORY_AGREEMENT :: READ_CAREFULLY ]
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, fontFamily: '"JetBrains Mono", monospace', color: "#ff2d92" }}>RISK DISCLOSURE</h2>
          <div style={{ padding: 16, marginTop: 18, background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,45,146,0.3)", fontSize: 12, color: "#c0c0dc", lineHeight: 1.6 }}>
            You are about to deploy an autonomous agent executing strategy <strong style={{ color: "#ff2d92" }}>{template?.name}</strong> with <strong style={{ color: "#ff2d92" }}>${capital} USDC</strong> of capital in <strong style={{ color: "#ff2d92" }}>{(mode || "paper").toUpperCase()}</strong> mode.
            <br /><br />
            By signing, you agree that:
            <ul style={{ margin: "10px 0", paddingLeft: 20, color: "#8a8a9e", fontSize: 11, lineHeight: 1.7 }}>
              <li>Paper mode is simulated — no real trades occur, no wallet risk.</li>
              <li>Live mode executes real on-chain trades and is <strong>restricted to pre-approved wallets</strong> during beta.</li>
              <li>Automated trading carries <strong>substantial risk of loss</strong>, including total loss of capital.</li>
              <li>Past performance is not indicative of future results.</li>
              <li>Platform operators are <strong>not responsible</strong> for losses from strategy behavior, market conditions, smart contract risks, or your configuration choices.</li>
              <li>This agreement is cryptographically signed, timestamped, and stored as a tamper-evident record.</li>
            </ul>
          </div>
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { key: "risk", text: "I understand automated trading may result in partial or total loss." },
              { key: "paper", text: "I understand this agent runs in paper mode unless my wallet is explicitly authorized for live execution." },
              { key: "liability", text: "I release the platform operators from liability for any losses arising from this agent's activity." },
            ].map(c => (
              <label key={c.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: 10, border: `1px solid ${checks[c.key] ? "#ff2d92" : "#333"}`, background: checks[c.key] ? "rgba(255,45,146,0.08)" : "transparent", transition: "all 0.2s" }}>
                <input type="checkbox" checked={checks[c.key]} onChange={e => setChecks({ ...checks, [c.key]: e.target.checked })} style={{ marginTop: 2, accentColor: "#ff2d92" }} />
                <span style={{ fontSize: 11, color: "#c0c0dc", lineHeight: 1.5 }}>{c.text}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <GlowButton onClick={onCancel} variant="ghost" color="#6a6a82" size="md" style={{ flex: 1 }}>CANCEL</GlowButton>
            <GlowButton onClick={onSign} color="#ff2d92" size="md" disabled={!allChecked || signing} style={{ flex: 2 }}>
              {signing ? "AWAITING WALLET SIGNATURE..." : "SIGN AGREEMENT & DEPLOY"}
            </GlowButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateAgentModal({ open, onClose, onDeploy, currentSlots, maxSlots, isAllowlisted, deploying }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(null);
  const [config, setConfig] = useState({});
  const [mode, setMode] = useState("paper");
  useEffect(() => { if (!open) { setStep(1); setSelected(null); setConfig({}); setMode("paper"); } }, [open]);
  if (!open) return null;
  const canDeploy = currentSlots < maxSlots;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div style={{ position: "relative", width: "min(720px, 94vw)", maxHeight: "88vh", overflow: "auto", padding: 28, background: "linear-gradient(135deg, #07070d 0%, #0d0515 100%)", border: "1px solid rgba(0,255,238,0.3)", boxShadow: "0 0 80px rgba(0,255,238,0.15)" }} onClick={e => e.stopPropagation()}>
        <CornerBrackets color="#00ffee" />
        <ScanlineOverlay />
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "#00ffee", fontFamily: '"JetBrains Mono", monospace', marginBottom: 4 }}>
              [ FORGE_PROTOCOL :: {step === 1 ? "SELECT_STRATEGY" : "CONFIGURE"} ]
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "-0.01em" }}>
              {step === 1 ? "DEPLOY NEW AGENT" : selected?.name}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #333", color: "#6a6a82", width: 32, height: 32, cursor: "pointer", fontSize: 18, fontFamily: "monospace" }}>×</button>
        </div>
        {!canDeploy && (
          <div style={{ padding: "12px 16px", marginBottom: 18, background: "rgba(255,45,146,0.08)", border: "1px solid rgba(255,45,146,0.4)", color: "#ff2d92", fontSize: 11, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em" }}>
            ⚠ SLOT_LIMIT_REACHED · upgrade tier to deploy more agents
          </div>
        )}
        {step === 1 && (
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {STRATEGY_TEMPLATES.map(t => (
              <div key={t.id} onClick={() => { if (canDeploy) { setSelected(t); setStep(2); } }} style={{ position: "relative", padding: 16, background: "rgba(5,5,12,0.6)", border: `1px solid ${t.color}33`, cursor: canDeploy ? "pointer" : "not-allowed", opacity: canDeploy ? 1 : 0.4, transition: "all 0.2s", overflow: "hidden" }}
                onMouseEnter={e => { if (canDeploy) { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = `${t.color}0a`; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = `${t.color}33`; e.currentTarget.style.background = "rgba(5,5,12,0.6)"; }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: `${t.color}15`, border: `1px solid ${t.color}66`, fontSize: 16, color: t.color, textShadow: `0 0 10px ${t.color}` }}>{t.icon}</div>
                  <span style={{ fontSize: 9, letterSpacing: "0.12em", fontFamily: '"JetBrains Mono", monospace', color: t.risk === "Low" ? "#00ff88" : t.risk === "Medium" ? "#ff9500" : "#ff2d92", padding: "2px 6px", border: "1px solid currentColor" }}>{t.risk.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', marginBottom: 4, letterSpacing: "0.03em" }}>{t.name}</div>
                <div style={{ fontSize: 10, color: "#8a8a9e", lineHeight: 1.4, marginBottom: 10 }}>{t.tagline}</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', color: "#6a6a82", letterSpacing: "0.05em" }}>
                  <span><span style={{ color: t.color }}>ROI_30D:</span> +{t.roi30d}%</span>
                  <span>{t.capital}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {step === 2 && selected && (
          <div style={{ position: "relative" }}>
            <div style={{ padding: 14, marginBottom: 16, background: "rgba(0,255,238,0.04)", border: "1px solid rgba(0,255,238,0.18)", fontSize: 11, color: "#c0c0dc", lineHeight: 1.5 }}>
              <span style={{ color: "#00ffee" }}>▸ </span>{selected.tagline}
            </div>
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 6 }}>AGENT_NAME (optional)</div>
              <input type="text" value={config.name || ""} onChange={e => setConfig({ ...config, name: e.target.value })} placeholder={`${selected.name} #${Date.now().toString().slice(-4)}`} style={inputStyle(selected.color)} />
            </label>
            <label style={{ display: "block", marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 6 }}>CAPITAL_ALLOCATION (USDC)</div>
              <input type="number" value={config.capital || ""} onChange={e => setConfig({ ...config, capital: parseFloat(e.target.value) || 0 })} placeholder="500" style={inputStyle(selected.color)} />
            </label>
            {selected.params.map(p => (
              <label key={p} style={{ display: "block", marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 6 }}>{p.toUpperCase().replace(/ /g, "_")}</div>
                <input type="text" value={config[p] || ""} onChange={e => setConfig({ ...config, [p]: e.target.value })} placeholder={`Configure ${p.toLowerCase()}`} style={inputStyle(selected.color)} />
              </label>
            ))}
            <div style={{ marginTop: 20, padding: 14, border: `1px solid ${isAllowlisted ? "#ff2d92" : "#00ffee"}33`, background: "rgba(0,0,0,0.3)" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 10 }}>EXECUTION_MODE</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setMode("paper")} style={{ flex: 1, padding: 10, fontSize: 10, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em", fontWeight: 700, cursor: "pointer", background: mode === "paper" ? "rgba(0,255,238,0.15)" : "transparent", color: mode === "paper" ? "#00ffee" : "#6a6a82", border: `1px solid ${mode === "paper" ? "#00ffee" : "#333"}` }}>
                  ◊ PAPER (SIMULATED)
                </button>
                <button onClick={() => { if (isAllowlisted) setMode("live"); }} disabled={!isAllowlisted} style={{ flex: 1, padding: 10, fontSize: 10, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.12em", fontWeight: 700, cursor: isAllowlisted ? "pointer" : "not-allowed", background: mode === "live" ? "rgba(255,45,146,0.15)" : "transparent", color: mode === "live" ? "#ff2d92" : isAllowlisted ? "#6a6a82" : "#333", border: `1px solid ${mode === "live" ? "#ff2d92" : "#333"}`, opacity: isAllowlisted ? 1 : 0.4 }}>
                  ▲ LIVE {!isAllowlisted && "(RESTRICTED)"}
                </button>
              </div>
              {!isAllowlisted && (
                <div style={{ marginTop: 8, fontSize: 9, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.5 }}>
                  Live execution is currently restricted to pre-approved wallets during private beta.
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <GlowButton onClick={() => setStep(1)} variant="ghost" color="#6a6a82" size="md" style={{ flex: 1 }}>← BACK</GlowButton>
              <GlowButton onClick={() => onDeploy(selected, config, mode)} color={selected.color} size="md" disabled={deploying || !canDeploy} style={{ flex: 2 }}>
                {deploying ? "DEPLOYING..." : "FORGE + DEPLOY ⚡"}
              </GlowButton>
            </div>
            <div style={{ marginTop: 14, padding: 10, background: "rgba(255,149,0,0.06)", border: "1px solid rgba(255,149,0,0.2)", fontSize: 9, color: "#ff9500", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em", lineHeight: 1.5 }}>
              ⚠ YOU WILL SIGN A RISK AGREEMENT BEFORE DEPLOYMENT · SIMULATED PNL ≠ REAL RETURNS
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = (color) => ({ width: "100%", padding: "12px 14px", fontSize: 13, fontFamily: '"JetBrains Mono", monospace', background: "rgba(0,0,0,0.4)", color: "#dcdce5", border: `1px solid ${color}33`, outline: "none", boxSizing: "border-box", transition: "all 0.2s" });

function AgentDetailDrawer({ agent, open, onClose, apiUrl }) {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!agent || !apiUrl) return;
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/agents/${agent.id}/logs`);
        const json = await res.json();
        if (!cancelled) setLogs(json.logs || []);
      } catch (e) { /* silent */ }
    };
    fetchLogs();
    const iv = setInterval(fetchLogs, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [agent, apiUrl]);
  if (!open || !agent) return null;
  const logColors = { info: "#00ffee", scan: "#8a8a9e", signal: "#ff9500", action: "#a855ff", success: "#00ff88", error: "#ff2d92" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div style={{ width: "min(520px, 92vw)", height: "100vh", background: "#07070d", borderLeft: `1px solid ${agent.color}44`, padding: 26, overflowY: "auto", animation: "slide-in 0.25s ease-out" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.3em", color: agent.color, fontFamily: '"JetBrains Mono", monospace', marginBottom: 6, textShadow: `0 0 8px ${agent.color}` }}>[ AGENT_INSPECTOR ]</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: `${agent.color}15`, border: `1px solid ${agent.color}88`, fontSize: 18, color: agent.color, textShadow: `0 0 10px ${agent.color}` }}>{agent.icon}</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace' }}>{agent.name}</span>
                  <ModeBadge mode={agent.mode} />
                </div>
                <div style={{ fontSize: 10, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>{agent.strategy}</div>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid #333", color: "#6a6a82", width: 32, height: 32, cursor: "pointer", fontSize: 18, fontFamily: "monospace" }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
          <DetailBox label="STATUS" value={agent.status.toUpperCase()} color={agent.status === "running" ? "#00ff88" : "#ff9500"} />
          <DetailBox label="UPTIME" value={`${Math.floor((Date.now() - agent.deployedAtMs) / 60000)}m`} color="#00ffee" />
          <DetailBox label="TRADES" value={agent.trades_executed} color="#dcdce5" />
          <DetailBox label="PNL" value={fmtUsd(agent.pnl)} sub={fmtPct(agent.pnl_pct)} color={agent.pnl >= 0 ? "#00ff88" : "#ff2d92"} />
        </div>
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 10 }}>LIVE_CONFIG</div>
          <div style={{ padding: 14, background: "rgba(5,5,12,0.8)", border: "1px solid #1a1a2e", fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
            {!agent.config || Object.keys(agent.config).length === 0 ? (
              <span style={{ color: "#6a6a82" }}>No custom configuration</span>
            ) : (
              Object.entries(agent.config).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "#6a6a82" }}>{k.replace(/ /g, "_").toUpperCase()}</span>
                  <span style={{ color: "#dcdce5" }}>{String(v)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 10 }}>
            ACTIVITY_LOG <span style={{ color: "#8a8a9e" }}>· live · last {logs.length}</span>
          </div>
          <div style={{ padding: 14, background: "rgba(5,5,12,0.8)", border: "1px solid #1a1a2e", fontFamily: '"JetBrains Mono", monospace', fontSize: 10, lineHeight: 1.7, maxHeight: 360, overflowY: "auto" }}>
            {logs.length === 0 ? (
              <div style={{ color: "#6a6a82" }}>Waiting for first tick...</div>
            ) : logs.map(log => {
              const t = new Date(log.created_at);
              const time = t.toLocaleTimeString('en-GB', { hour12: false });
              return (
                <div key={log.id} style={{ display: "flex", gap: 12, marginBottom: 4 }}>
                  <span style={{ color: "#6a6a82" }}>[{time}]</span>
                  <span style={{ color: logColors[log.log_type] || "#dcdce5", width: 60, fontWeight: 600, letterSpacing: "0.1em", fontSize: 9 }}>{log.log_type.toUpperCase()}</span>
                  <span style={{ color: "#c0c0dc", flex: 1 }}>{log.message}</span>
                </div>
              );
            })}
            <div style={{ color: "#6a6a82", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status={agent.status} size={6} />
              {agent.status === "running" ? "monitoring conditions..." : agent.status}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailBox({ label, value, sub, color = "#dcdce5" }) {
  return (
    <div style={{ padding: 12, background: "rgba(5,5,12,0.8)", border: "1px solid #1a1a2e" }}>
      <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: '"JetBrains Mono", monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color, opacity: 0.7, fontFamily: '"JetBrains Mono", monospace', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────
export default function AgentForge({ apiUrl }) {
  const { address, isConnected, signer } = useWallet() || {};
  const [subscription, setSubscription] = useState({ tier: 0, expiry: 0, agentsUsed: 0, agentsAllowed: 1 });
  const [agents, setAgents] = useState([]);
  const [range, setRange] = useState("all");        // Wave 1: chart time horizon — 24h | 7d | 30d | all
  const [createOpen, setCreateOpen] = useState(false);
  const [inspectAgent, setInspectAgent] = useState(null);
  const [policyAgent, setPolicyAgent] = useState(null);          // S3: which agent's policy is being edited
  const [policyInitialTab, setPolicyInitialTab] = useState("risk");
  const [isAllowlisted, setIsAllowlisted] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [pendingDeploy, setPendingDeploy] = useState(null);
  const [signing, setSigning] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      if (!address || !apiUrl) {
        setSubscription({ tier: 0, expiry: 0, agentsUsed: 0, agentsAllowed: 1 });
        return;
      }
      // Use backend API — it honors DEV_TIER_OVERRIDE_WALLETS and falls back
      // to FREE default for unminted wallets instead of 500ing on contract revert.
      // Cache-bust + no-store headers to bypass Railway edge cache.
      const res = await fetch(
        `${apiUrl}/api/agents/subscription/${address.toLowerCase()}?t=${Date.now()}`,
        { cache: "no-store", headers: { "Cache-Control": "no-cache" } }
      );
      const json = await res.json();

      // Backend returns tier as string: "Free" | "Pro" | "Whale"
      const tierMap = { Free: 0, Pro: 1, Whale: 2 };
      const tierNum = typeof json.tier === "string" ? (tierMap[json.tier] ?? 0) : Number(json.tier) || 0;
      const allowed = json.agentsAllowed === "unlimited"
        ? 999
        : Number(json.agentsAllowed) || 1;

      setSubscription({
        tier: tierNum,
        expiry: Number(json.expiry) || 0,
        agentsUsed: Number(json.agentsUsed) || 0,
        agentsAllowed: allowed,
      });
    } catch (e) {
      console.warn("Subscription read failed:", e.message);
      setSubscription({ tier: 0, expiry: 0, agentsUsed: 0, agentsAllowed: 1 });
    }
  }, [address, apiUrl]);

  const checkAllowlist = useCallback(async () => {
    if (!address || !apiUrl) { setIsAllowlisted(false); return; }
    try {
      const res = await fetch(
        `${apiUrl}/api/agents/allowlist/${address.toLowerCase()}?t=${Date.now()}`,
        { cache: "no-store", headers: { "Cache-Control": "no-cache" } }
      );
      const json = await res.json();
      setIsAllowlisted(!!json.allowed);
    } catch (e) { setIsAllowlisted(false); }
  }, [address, apiUrl]);

  const fetchAgents = useCallback(async () => {
    if (!address || !apiUrl) { setAgents([]); return; }
    try {
      // Wave 1: hit the dashboard endpoint to get agents PLUS time-series in one round-trip.
      // Falls back to /api/agents/list if dashboard is unavailable for any reason.
      const dashUrl = `${apiUrl}/api/agents/dashboard/${address.toLowerCase()}?range=${encodeURIComponent(range)}&t=${Date.now()}`;
      const res = await fetch(dashUrl, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
      if (res.ok) {
        const json = await res.json();
        setAgents((json.agents || []).map(hydrateAgent));
        return;
      }
      // Fallback to legacy list endpoint — no charts, but agents still render
      const fallback = await fetch(
        `${apiUrl}/api/agents/list/${address.toLowerCase()}?t=${Date.now()}`,
        { cache: "no-store", headers: { "Cache-Control": "no-cache" } }
      );
      const fjson = await fallback.json();
      setAgents((fjson.agents || []).map(hydrateAgent));
    } catch (e) {
      console.error("Agent fetch failed:", e.message);
    }
  }, [address, apiUrl, range]);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);
  useEffect(() => { checkAllowlist(); }, [checkAllowlist]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useEffect(() => {
    const iv = setInterval(fetchAgents, 15_000);
    return () => clearInterval(iv);
  }, [fetchAgents]);

  const handleStartDeploy = (template, config, mode) => {
    if (!isConnected) { alert("Connect your wallet to deploy an agent."); return; }
    setPendingDeploy({ template, config, mode });
    setCreateOpen(false);
    setRiskOpen(true);
  };

  const handleSignAgreement = async () => {
    if (!pendingDeploy || !address || !signer) { alert("Wallet not connected or signer unavailable."); return; }
    setSigning(true);
    try {
      const { template, config, mode } = pendingDeploy;
      const capital = Number(config.capital) || 500;
      const ts = new Date().toISOString();
      const message = [
        "═════════════════════════════════════════",
        "  AGENTFORGE · RISK AGREEMENT",
        "═════════════════════════════════════════",
        "",
        `Wallet:    ${address}`,
        `Strategy:  ${template.name} (${template.id})`,
        `Mode:      ${mode.toUpperCase()}`,
        `Capital:   $${capital} USDC`,
        `Timestamp: ${ts}`,
        "",
        "I acknowledge:",
        "- Automated trading carries risk of total loss",
        "- Platform operators are not liable for outcomes",
        "- This agreement is a tamper-evident record",
      ].join("\n");

      const signature = await signer.signMessage(message);

      // 1. Store the signed agreement, capture its id
      const agreementRes = await fetch(`${apiUrl}/api/agents/risk-agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_address: address,
          message,
          signature,
          strategy_id: template.id,
          max_capital: capital,
        }),
      });
      const agreementJson = await agreementRes.json();
      const agreementId = agreementJson.agreement_id;

      setDeploying(true);
      // 2. Create the agent, capture its id
      const deployRes = await fetch(`${apiUrl}/api/agents/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_address: address,
          template_id: template.id,
          name: config.name || undefined,
          strategy_name: template.name,
          icon: template.icon,
          color: template.color,
          capital,
          config,
          mode,
        }),
      });
      const deployJson = await deployRes.json();
      if (deployJson.error) throw new Error(deployJson.error);

      // 3. Link the agreement to the created agent (best effort, non-blocking)
      const newAgentId = deployJson?.agent?.id;
      if (agreementId && newAgentId) {
        fetch(`${apiUrl}/api/agents/risk-agreement/${agreementId}/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: newAgentId }),
        }).catch(() => { /* non-blocking: deploy already succeeded */ });
      }

      await fetchAgents();
      setRiskOpen(false);
      setPendingDeploy(null);

      // 4. Re-hydrate wallet state — signing can cause Brave to lose provider context
      try {
        const accounts = await window.ethereum?.request({ method: "eth_accounts" });
        if (accounts && accounts.length === 0) {
          console.warn("[Deploy] Wallet lost connection after signing — user may need to reconnect");
        }
      } catch { /* ignore */ }
    } catch (e) {
      alert(`Deploy failed: ${e.message || e}`);
    } finally {
      setSigning(false);
      setDeploying(false);
    }
  };

  const handlePause = async (id) => { await fetch(`${apiUrl}/api/agents/${id}/pause`, { method: "POST" }); fetchAgents(); };
  const handleResume = async (id) => { await fetch(`${apiUrl}/api/agents/${id}/resume`, { method: "POST" }); fetchAgents(); };

  // S3: halt/unhalt + edit policy
  const handleHalt = async (id) => {
    if (!address) return;
    const agent = agents.find(a => a.id === id);
    const name = agent?.name || id;
    const ok = window.confirm(
      `Halt ${name}?\n\n` +
      `This stops the agent immediately. Strategy ticks resume only when ` +
      `you click UNHALT. Existing trade history is preserved.`
    );
    if (!ok) return;
    try {
      await fetch(`${apiUrl}/api/agents/${id}/halt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Wallet-Address": address.toLowerCase(),
        },
        body: JSON.stringify({ reason: "Manual halt from UI" }),
      });
      fetchAgents();
    } catch (err) {
      console.error("[AgentForge] handleHalt failed:", err);
    }
  };

  const handleUnhalt = async (id) => {
    if (!address) return;
    try {
      await fetch(`${apiUrl}/api/agents/${id}/unhalt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Wallet-Address": address.toLowerCase(),
        },
      });
      fetchAgents();
    } catch (err) {
      console.error("[AgentForge] handleUnhalt failed:", err);
    }
  };

  const handleEditPolicy = (agent, initialTab = "risk") => {
    setPolicyInitialTab(initialTab);
    setPolicyAgent(agent);
  };
  const handleDelete = async (id) => {
    if (!window.confirm("Terminate this agent? All state will be lost.")) return;
    await fetch(`${apiUrl}/api/agents/${id}`, { method: "DELETE" });
    fetchAgents();
  };
  const handleUpgrade = () => alert("Subscription upgrade flow: Stripe + on-chain NFT minting coming in next phase.");

  const tierMeta = TIER_META[subscription.tier] || TIER_META[0];

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", background: `radial-gradient(ellipse at top left, rgba(0,255,238,0.04), transparent 50%), radial-gradient(ellipse at bottom right, rgba(255,45,146,0.04), transparent 50%), #04040a`, padding: "20px 24px", color: "#dcdce5" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;900&display=swap');
        @keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      <HeroStats subscription={subscription} agents={agents} />
      <AllocationDonut agents={agents} />
      <SubscriptionCard subscription={subscription} isAllowlisted={isAllowlisted} onUpgrade={handleUpgrade} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em" }}>DEPLOYED_AGENTS</h2>
          <div style={{ fontSize: 10, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginTop: 2, letterSpacing: "0.1em" }}>
            {agents.length} total · {Math.max(0, subscription.agentsAllowed - agents.length)} slots remaining
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {agents.length > 0 && <RangePicker range={range} onChange={setRange} />}
          <GlowButton onClick={() => setCreateOpen(true)} color="#00ffee" size="md" disabled={!isConnected || agents.length >= tierMeta.allowed}>
            {!isConnected ? "CONNECT WALLET" : "+ DEPLOY AGENT"}
          </GlowButton>
        </div>
      </div>

      {agents.length === 0 ? (
        <div style={{ position: "relative", padding: "60px 30px", textAlign: "center", background: "linear-gradient(135deg, rgba(10,10,18,0.6) 0%, rgba(5,5,12,0.6) 100%)", border: "1px dashed rgba(0,255,238,0.2)", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(0,255,238,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,238,0.03) 1px, transparent 1px)`, backgroundSize: "32px 32px" }} />
          <div style={{ position: "relative", fontSize: 40, marginBottom: 14, opacity: 0.6 }}>◌</div>
          <div style={{ position: "relative", fontSize: 13, fontFamily: '"JetBrains Mono", monospace', color: "#8a8a9e", letterSpacing: "0.1em", marginBottom: 6 }}>[ NO_AGENTS_DEPLOYED ]</div>
          <div style={{ position: "relative", fontSize: 11, color: "#6a6a82", marginBottom: 22, maxWidth: 400, margin: "0 auto 22px" }}>
            {isConnected ? "Deploy your first autonomous trading agent. Choose from 6 proven strategies. All agents run in paper mode by default." : "Connect your wallet to deploy agents."}
          </div>
          {isConnected && <GlowButton onClick={() => setCreateOpen(true)} color="#00ffee" size="lg">⚡ FORGE FIRST AGENT</GlowButton>}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onPause={handlePause}
              onResume={handleResume}
              onDelete={handleDelete}
              onInspect={setInspectAgent}
              onEditPolicy={handleEditPolicy}
              onHalt={handleHalt}
              onUnhalt={handleUnhalt}
              apiUrl={apiUrl}
            />
          ))}
        </div>
      )}

      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} onDeploy={handleStartDeploy} currentSlots={agents.length} maxSlots={tierMeta.allowed} isAllowlisted={isAllowlisted} deploying={deploying} />
      <RiskAgreementModal open={riskOpen} template={pendingDeploy?.template} capital={Number(pendingDeploy?.config?.capital) || 500} mode={pendingDeploy?.mode} onSign={handleSignAgreement} onCancel={() => { setRiskOpen(false); setPendingDeploy(null); }} signing={signing} />
      <AgentDetailDrawer agent={inspectAgent} open={!!inspectAgent} onClose={() => setInspectAgent(null)} apiUrl={apiUrl} />
      <EditPolicyModal
        open={!!policyAgent}
        agent={policyAgent}
        apiUrl={apiUrl}
        ownerWallet={address ? address.toLowerCase() : ""}
        initialTab={policyInitialTab}
        onClose={() => setPolicyAgent(null)}
        onSaved={() => { /* keep modal open, just refreshed internally */ }}
      />
    </div>
  );
}
