import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet } from "./wallet-integration";
import {
  LineChart, Line, AreaChart, Area, ResponsiveContainer,
  Tooltip, ReferenceLine, YAxis,
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

function AgentCard({ agent, onPause, onResume, onDelete, onInspect }) {
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
          <StatusDot status={agent.status} />
          <span style={{ fontSize: 9, letterSpacing: "0.12em", color: agent.status === "running" ? "#00ff88" : agent.status === "paused" ? "#ff9500" : "#ff2d92", fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}>
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
      <div style={{ display: "flex", gap: 6, marginTop: 14 }} onClick={e => e.stopPropagation()}>
        {canToggle && (
          agent.status === "running"
            ? <GlowButton onClick={() => onPause(agent.id)} color="#ff9500" variant="ghost" size="sm" style={{ flex: 1 }}>PAUSE</GlowButton>
            : <GlowButton onClick={() => onResume(agent.id)} color="#00ff88" variant="ghost" size="sm" style={{ flex: 1 }}>RESUME</GlowButton>
        )}
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
            <AgentCard key={agent.id} agent={agent} onPause={handlePause} onResume={handleResume} onDelete={handleDelete} onInspect={setInspectAgent} />
          ))}
        </div>
      )}

      <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} onDeploy={handleStartDeploy} currentSlots={agents.length} maxSlots={tierMeta.allowed} isAllowlisted={isAllowlisted} deploying={deploying} />
      <RiskAgreementModal open={riskOpen} template={pendingDeploy?.template} capital={Number(pendingDeploy?.config?.capital) || 500} mode={pendingDeploy?.mode} onSign={handleSignAgreement} onCancel={() => { setRiskOpen(false); setPendingDeploy(null); }} signing={signing} />
      <AgentDetailDrawer agent={inspectAgent} open={!!inspectAgent} onClose={() => setInspectAgent(null)} apiUrl={apiUrl} />
    </div>
  );
}
