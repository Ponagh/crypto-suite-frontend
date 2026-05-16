import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useWallet, useVaultDeposit } from "./wallet-integration";

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  YIELDPILOT — v3 (resilient RPC, better AI pick, APY sanity)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const YIELD_PILOT_VAULT = "0x8d0420fe81C3499D414ac3dEB2f37E8F5297df9F";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// RPC fallback list — try each in order
const RPC_URLS = [
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://base.meowrpc.com",
  "https://mainnet.base.org",
];

const VAULT_ABI = [
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function totalDeposits() view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function positions(address) view returns (uint256 deposited, uint256 shares, uint256 depositTimestamp)",
  "function paused() view returns (bool)",
];

const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const num = (v) => {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};
const fmtUsd = (n) => {
  const v = num(n);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
};
const fmtCompact = (n) => {
  const v = num(n);
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtPct = (n) => `${num(n).toFixed(2)}%`;

// Try RPCs in order until one works
async function getWorkingProvider() {
  for (const url of RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber(); // quick connectivity test
      return p;
    } catch {
      continue;
    }
  }
  throw new Error("All Base RPCs unreachable");
}

// ─── UI atoms ────────────────────────────────────────────────────────────────
function MiniChart({ data, color = "#00ff88", width = 80, height = 28 }) {
  const d = (data || []).map(num);
  if (d.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...d);
  const min = Math.min(...d);
  const range = max - min || 1;
  const points = d.map((v, i) => {
    const x = (i / (d.length - 1)) * width;
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
  const map = {
    Low:    { color: "#00ff88", bg: "rgba(0,255,136,0.08)" },
    Medium: { color: "#ffaa00", bg: "rgba(255,170,0,0.12)" },
    High:   { color: "#ff2d92", bg: "rgba(255,45,146,0.1)" },
  };
  const c = map[level] || map.Low;
  return (
    <span style={{
      padding: "2px 8px", fontSize: 9, fontFamily: '"JetBrains Mono", monospace',
      fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
      color: c.color, background: c.bg, borderRadius: 3,
    }}>{level}</span>
  );
}

function Spinner({ size = 14 }) {
  return (
    <div style={{
      width: size, height: size, border: "2px solid #1a1a2e",
      borderTopColor: "#00ffee", borderRadius: "50%",
      animation: "spin 0.8s linear infinite", display: "inline-block",
    }} />
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────
function DepositModal({ open, onClose, userUsdcBalance, userPosition, pricePerShare, onDeposit, onWithdraw, txStatus }) {
  const [mode, setMode] = useState("deposit");
  const [amount, setAmount] = useState("");
  if (!open) return null;

  const userUsdc = num(userUsdcBalance);
  const userShares = num(userPosition?.shares);
  const userValue = userShares * num(pricePerShare);

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    if (mode === "deposit") onDeposit(amt);
    else onWithdraw(amt);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(4,4,10,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, backdropFilter: "blur(6px)",
    }} onClick={onClose}>
      <div style={{
        width: 420, padding: 24, background: "#08080f",
        border: "1px solid #1a1a2e", borderRadius: 12,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 4, marginBottom: 20, padding: 3, background: "#04040a", borderRadius: 6 }}>
          {["deposit", "withdraw"].map(m => (
            <button key={m} onClick={() => { setMode(m); setAmount(""); }} style={{
              flex: 1, padding: "8px 12px", fontSize: 11, fontWeight: 600,
              fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.06em", textTransform: "uppercase",
              background: mode === m ? "#00ffee" : "transparent",
              color: mode === m ? "#fff" : "#6a6a82",
              border: "none", borderRadius: 4, cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>
        <div style={{ marginBottom: 14, fontSize: 10, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.08em" }}>
          {mode === "deposit" ? "AMOUNT (USDC)" : "SHARES TO WITHDRAW"}
        </div>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              width: "100%", padding: "14px 70px 14px 14px", fontSize: 20,
              fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
              background: "#04040a", color: "#dcdce5",
              border: "1px solid #1a1a2e", borderRadius: 6, boxSizing: "border-box",
            }} />
          <button
            onClick={() => setAmount(mode === "deposit" ? userUsdc.toFixed(2) : userShares.toFixed(4))}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              padding: "4px 10px", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontWeight: 700,
              background: "rgba(0,255,238,0.08)", color: "#00ffee",
              border: "1px solid rgba(0,255,238,0.25)", borderRadius: 4, cursor: "pointer",
            }}>MAX</button>
        </div>
        <div style={{ fontSize: 10, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace', marginBottom: 18 }}>
          {mode === "deposit"
            ? `Wallet balance: ${userUsdc.toFixed(2)} USDC`
            : `Your shares: ${userShares.toFixed(4)}  ·  Value: ${fmtUsd(userValue)}`}
        </div>
        {txStatus && (
          <div style={{
            padding: "8px 12px", marginBottom: 14, borderRadius: 6,
            background: txStatus.type === "error" ? "rgba(255,45,146,0.1)" :
                        txStatus.type === "success" ? "rgba(0,255,136,0.08)" : "rgba(255,170,0,0.12)",
            color: txStatus.type === "error" ? "#ff2d92" :
                   txStatus.type === "success" ? "#00ff88" : "#ffaa00",
            fontSize: 10, fontFamily: '"JetBrains Mono", monospace', wordBreak: "break-all",
          }}>{txStatus.message}</div>
        )}
        <button onClick={handleSubmit} disabled={!amount || parseFloat(amount) <= 0 || txStatus?.type === "pending"} style={{
          width: "100%", padding: "12px 0", fontSize: 12, fontWeight: 700,
          fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.08em", textTransform: "uppercase",
          background: mode === "deposit" ? "#00ffee" : "#ff2d92",
          color: "#fff", border: "none", borderRadius: 6, cursor: "pointer",
          opacity: !amount || parseFloat(amount) <= 0 || txStatus?.type === "pending" ? 0.4 : 1,
        }}>
          {txStatus?.type === "pending" ? "PROCESSING..." :
            mode === "deposit" ? `DEPOSIT ${amount || "0"} USDC` : `WITHDRAW ${amount || "0"} SHARES`}
        </button>
        <button onClick={onClose} style={{
          width: "100%", marginTop: 8, padding: "10px 0", fontSize: 10,
          fontFamily: '"JetBrains Mono", monospace', background: "transparent", color: "#6a6a82",
          border: "1px solid #1a1a2e", borderRadius: 6, cursor: "pointer",
          letterSpacing: "0.08em", textTransform: "uppercase",
        }}>Cancel</button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function YieldPilot({ apiUrl }) {
  const { address, isConnected } = useWallet() || {};
  const { deposit, withdraw } = useVaultDeposit() || {};

  const [vaultStats, setVaultStats] = useState(null);
  const [userPosition, setUserPosition] = useState(null);
  const [userUsdcBalance, setUserUsdcBalance] = useState("0");
  const [pools, setPools] = useState([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState("apy");
  const [riskFilter, setRiskFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [txStatus, setTxStatus] = useState(null);

  const fetchVaultData = useCallback(async () => {
    try {
      const rpc = await getWorkingProvider();
      const vault = new ethers.Contract(YIELD_PILOT_VAULT, VAULT_ABI, rpc);

      // Use individual tries — if totalShares is 0, sharePrice reverts (div by zero)
      // so handle it gracefully
      const [totalAssetsRaw, totalSharesRaw, totalDepositedRaw, pausedRaw] =
        await Promise.all([
          vault.totalAssets().catch(() => 0n),
          vault.totalShares().catch(() => 0n),
          vault.totalDeposits().catch(() => 0n),
          vault.paused().catch(() => false),
        ]);

      // Only call sharePrice if vault has shares
      let sharePriceRaw = 1000000000000000000n; // 1e18 default (sharePrice is 1e18-scaled per contract)
      if (totalSharesRaw > 0n) {
        try {
          sharePriceRaw = await vault.sharePrice();
        } catch {
          // fallback to 1.0
        }
      }

      setVaultStats({
        totalAssets: Number(ethers.formatUnits(totalAssetsRaw, 6)),
        totalShares: Number(ethers.formatUnits(totalSharesRaw, 6)),       // shares scale 1:1 with USDC (6dp)
        totalDeposited: Number(ethers.formatUnits(totalDepositedRaw, 6)),
        pricePerShare: Number(ethers.formatUnits(sharePriceRaw, 18)),     // sharePrice is 1e18-scaled
        paused: pausedRaw,
        performanceFeePercent: 0.5,                                        // PERFORMANCE_FEE_BPS = 50 = 0.5%
        isEmpty: totalSharesRaw === 0n,
      });

      if (address) {
        try {
          // positions() returns (deposited, shares, depositTimestamp) — NOT (shares, deposited, timestamp)
          const pos = await vault.positions(address);
          setUserPosition({
            shares: Number(ethers.formatUnits(pos[1], 6)),            // shares at index 1, 6 decimals
            depositedAmount: Number(ethers.formatUnits(pos[0], 6)),   // deposited at index 0
            depositedAt: Number(pos[2]),                              // timestamp at index 2
          });
        } catch {
          setUserPosition({ shares: 0, depositedAmount: 0, depositedAt: 0 });
        }
        try {
          const usdc = new ethers.Contract(USDC_BASE, USDC_ABI, rpc);
          const bal = await usdc.balanceOf(address);
          setUserUsdcBalance(ethers.formatUnits(bal, 6));
        } catch {
          setUserUsdcBalance("0");
        }
      }
    } catch (e) {
      console.error("Vault read failed:", e);
      setError(`RPC unreachable — pools still load from backend cache`);
      // Set empty defaults so UI still renders
      setVaultStats({
        totalAssets: 0, totalShares: 0, totalDeposited: 0,
        pricePerShare: 1, paused: false, performanceFeePercent: 0.5, isEmpty: true,
      });
    } finally {
      setVaultLoading(false);
    }
  }, [address]);

  const fetchPools = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}/api/yield/pools`);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const json = await res.json();
      setPools(json.pools || []);
    } catch (e) {
      console.error("Pool fetch failed:", e);
      setError(`Pool fetch: ${e.message}`);
    } finally {
      setPoolsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { fetchVaultData(); }, [fetchVaultData]);
  useEffect(() => { fetchPools(); }, [fetchPools]);

  useEffect(() => {
    const iv = setInterval(() => {
      fetchVaultData();
      fetchPools();
    }, 60000);
    return () => clearInterval(iv);
  }, [fetchVaultData, fetchPools]);

  const handleDeposit = async (amount) => {
    if (!deposit) return setTxStatus({ type: "error", message: "Wallet hook not available" });
    setTxStatus({ type: "pending", message: "Approve & deposit pending..." });
    try {
      const txHash = await deposit(amount);
      setTxStatus({ type: "success", message: `✓ Deposited — tx: ${txHash?.slice(0, 12)}...` });
      await fetchVaultData();
      setTimeout(() => { setModalOpen(false); setTxStatus(null); }, 2500);
    } catch (e) { setTxStatus({ type: "error", message: e.message || "Deposit failed" }); }
  };

  const handleWithdraw = async (shares) => {
    if (!withdraw) return setTxStatus({ type: "error", message: "Wallet hook not available" });
    setTxStatus({ type: "pending", message: "Withdrawal pending..." });
    try {
      const txHash = await withdraw(shares);
      setTxStatus({ type: "success", message: `✓ Withdrawn — tx: ${txHash?.slice(0, 12)}...` });
      await fetchVaultData();
      setTimeout(() => { setModalOpen(false); setTxStatus(null); }, 2500);
    } catch (e) { setTxStatus({ type: "error", message: e.message || "Withdraw failed" }); }
  };

  const userValueUsd = userPosition && vaultStats
    ? userPosition.shares * vaultStats.pricePerShare : 0;
  const userEarnings = userPosition && userValueUsd > 0
    ? userValueUsd - userPosition.depositedAmount : 0;

  const normalizedPools = pools.map(p => ({
    ...p,
    apy: num(p.apy),
    tvl_usd: num(p.tvl_usd),
    trend: Array.isArray(p.trend) ? p.trend.map(num) : null,
  }));

  const filteredPools = normalizedPools
    .filter(p => riskFilter === "all" || p.risk === riskFilter)
    .sort((a, b) => {
      if (sortBy === "apy") return b.apy - a.apy;
      if (sortBy === "tvl") return b.tvl_usd - a.tvl_usd;
      if (sortBy === "risk") {
        const order = { Low: 0, Medium: 1, High: 2 };
        return (order[a.risk] || 0) - (order[b.risk] || 0);
      }
      return 0;
    });

  // Smarter AI pick — best risk-adjusted (sharpe-like): Low risk with highest APY
  // Fall back to best Medium if no good Low exists
  const aiPick =
    normalizedPools
      .filter(p => p.risk === "Low" && p.apy >= 3 && p.apy <= 30 && p.tvl_usd >= 5_000_000)
      .sort((a, b) => b.apy - a.apy)[0]
    ||
    normalizedPools
      .filter(p => p.risk === "Low")
      .sort((a, b) => b.apy - a.apy)[0]
    ||
    normalizedPools[0];

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", background: "#04040a", color: "#dcdce5", padding: "20px 24px" }}>
      <div className="app-header" style={{ marginBottom: 24 }}>
        <div className="app-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "rgba(0,255,136,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📊</div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0, fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.05em", color: "#00ffee" }}>YIELDPILOT</h1>
            <p style={{ fontSize: 11, color: "#6a6a82", margin: 0 }}>
              USDC Vault · Live on Base Mainnet
              {vaultStats?.paused && <span style={{ color: "#ff2d92", marginLeft: 8 }}>⚠ PAUSED</span>}
              {vaultStats?.isEmpty && <span style={{ color: "#ffaa00", marginLeft: 8 }}>· Empty vault — be first to deposit</span>}
            </p>
          </div>
        </div>
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;900&display=swap');`}</style>
      {error && (
        <div style={{
          padding: "10px 14px", marginBottom: 14, borderRadius: 6,
          background: "rgba(255,170,0,0.10)", border: "1px solid rgba(255,170,0,0.22)",
          color: "#ffaa00", fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{error}</span>
          <button onClick={() => setError("")} style={{
            background: "none", border: "none", color: "#ffaa00", cursor: "pointer", fontSize: 14,
          }}>×</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 24 }}>
        {vaultLoading ? (
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "center", padding: 30 }}>
            <Spinner size={24} />
          </div>
        ) : (
          <>
            <StatCard label="VAULT TVL" value={fmtCompact(vaultStats?.totalAssets)}
              sub={`${num(vaultStats?.totalShares).toFixed(2)} shares`} color="#00ffee" />
            <StatCard label="YOUR DEPOSIT"
              value={isConnected ? fmtUsd(userPosition?.depositedAmount) : "—"}
              sub={isConnected ? `${num(userPosition?.shares).toFixed(4)} shares` : "connect wallet"}
              color="#dcdce5" />
            <StatCard label="YOUR VALUE"
              value={isConnected ? fmtUsd(userValueUsd) : "—"}
              sub={isConnected && userEarnings !== 0 ? `${userEarnings >= 0 ? "+" : ""}${fmtUsd(userEarnings)}` : ""}
              color={userEarnings >= 0 ? "#00ff88" : "#ff2d92"} />
            <StatCard label="PRICE PER SHARE"
              value={num(vaultStats?.pricePerShare).toFixed(6)}
              sub={`${num(vaultStats?.performanceFeePercent)}% perf fee`}
              color="#8b5cf6" />
          </>
        )}
      </div>

      <div style={{
        padding: 20, marginBottom: 24, borderRadius: 8,
        background: "linear-gradient(135deg, rgba(0,255,238,0.06), rgba(139,92,246,0.08))",
        border: "1px solid rgba(0,255,238,0.2)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>YieldPilot Vault</div>
            <div style={{ fontSize: 11, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>
              {YIELD_PILOT_VAULT.slice(0, 10)}···{YIELD_PILOT_VAULT.slice(-8)}
            </div>
          </div>
          {isConnected ? (
            <button onClick={() => setModalOpen(true)} disabled={vaultStats?.paused} style={{
              padding: "10px 20px", fontSize: 11, fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.08em",
              background: vaultStats?.paused ? "#1a1a2e" : "#00ffee",
              color: vaultStats?.paused ? "#6a6a82" : "#fff",
              border: "none", borderRadius: 6,
              cursor: vaultStats?.paused ? "not-allowed" : "pointer",
            }}>
              {vaultStats?.paused ? "VAULT PAUSED" : "DEPOSIT / WITHDRAW"}
            </button>
          ) : (
            <div style={{ fontSize: 11, color: "#6a6a82", fontFamily: '"JetBrains Mono", monospace' }}>
              Connect wallet to deposit
            </div>
          )}
        </div>
      </div>

      {aiPick && (
        <div style={{
          padding: 20, marginBottom: 24, borderRadius: 8,
          background: "#08080f", border: "1px solid rgba(0,255,136,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>🧠</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>AI Recommendation</div>
              <div style={{ fontSize: 10, color: "#6a6a82" }}>Best risk-adjusted yield right now</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>{aiPick.protocol_logo}</span>
            <span style={{ fontWeight: 600 }}>{aiPick.asset} on {aiPick.protocol}</span>
            <span style={{ fontSize: 11, color: "#6a6a82" }}>{aiPick.strategy}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 28, fontWeight: 700, color: "#00ff88" }}>
              {fmtPct(aiPick.apy)}
            </span>
            <span style={{ fontSize: 11, color: "#6a6a82" }}>APY</span>
            <RiskBadge level={aiPick.risk} />
            <span style={{ fontSize: 11, color: "#6a6a82", marginLeft: "auto" }}>
              TVL {fmtCompact(aiPick.tvl_usd)}
            </span>
          </div>
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, flexWrap: "wrap", gap: 12,
      }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
          Live Yield Opportunities
        </h2>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ key: "apy", label: "APY" }, { key: "tvl", label: "TVL" }, { key: "risk", label: "RISK" }].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)} style={{
              padding: "5px 10px", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
              letterSpacing: "0.08em",
              background: sortBy === s.key ? "rgba(0,255,238,0.08)" : "transparent",
              color: sortBy === s.key ? "#00ffee" : "#6a6a82",
              border: `1px solid ${sortBy === s.key ? "rgba(0,255,238,0.25)" : "#1a1a2e"}`,
              borderRadius: 4, cursor: "pointer",
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {["all", "Low", "Medium", "High"].map(r => (
          <button key={r} onClick={() => setRiskFilter(r)} style={{
            padding: "5px 10px", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
            letterSpacing: "0.08em",
            background: riskFilter === r ? "rgba(0,255,238,0.08)" : "transparent",
            color: riskFilter === r ? "#00ffee" : "#6a6a82",
            border: `1px solid ${riskFilter === r ? "rgba(0,255,238,0.25)" : "#1a1a2e"}`,
            borderRadius: 4, cursor: "pointer",
          }}>{r === "all" ? "ALL" : r.toUpperCase()}</button>
        ))}
      </div>

      {poolsLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Spinner size={24} /></div>
      ) : filteredPools.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6a6a82", fontSize: 11, fontFamily: '"JetBrains Mono", monospace' }}>
          No pools yet. Backend will populate within ~10 minutes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filteredPools.map(pool => (
            <div key={pool.id} style={{
              padding: "14px 16px", background: "#08080f",
              border: "1px solid #1a1a2e", borderRadius: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{pool.protocol_logo}</span>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{pool.asset}</span>
                    <span style={{ fontSize: 11, color: "#6a6a82", marginLeft: 8 }}>{pool.protocol}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <MiniChart
                    data={pool.trend || [pool.apy, pool.apy, pool.apy, pool.apy, pool.apy, pool.apy]}
                    color={pool.risk === "High" ? "#ff2d92" : pool.risk === "Medium" ? "#ffaa00" : "#00ff88"}
                  />
                  <RiskBadge level={pool.risk} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, fontWeight: 700, color: "#00ff88" }}>
                      {fmtPct(pool.apy)}
                    </span>
                    <span style={{ fontSize: 10, color: "#6a6a82", marginLeft: 4 }}>APY</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#6a6a82", display: "flex", gap: 14, alignItems: "center" }}>
                    <span>TVL: {fmtCompact(pool.tvl_usd)}</span>
                    <span>{pool.strategy}</span>
                    {pool.bonus && <span style={{ color: "#00ffee" }}>{pool.bonus}</span>}
                  </div>
                </div>
                <span style={{
                  padding: "4px 8px", fontSize: 9, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600,
                  color: "#6a6a82", background: "#04040a", border: "1px solid #1a1a2e",
                  borderRadius: 4, letterSpacing: "0.06em",
                }}>
                  {pool.audited ? "✓ AUDITED" : "UNAUDITED"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <DepositModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setTxStatus(null); }}
        userUsdcBalance={userUsdcBalance}
        userPosition={userPosition}
        pricePerShare={vaultStats?.pricePerShare}
        onDeposit={handleDeposit}
        onWithdraw={handleWithdraw}
        txStatus={txStatus}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      padding: "14px 16px", background: "#08080f",
      border: "1px solid #1a1a2e", borderRadius: 8,
    }}>
      <div style={{ fontSize: 9, color: "#6a6a82", letterSpacing: "0.12em", marginBottom: 6, fontFamily: '"JetBrains Mono", monospace' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: '"JetBrains Mono", monospace' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 9, color: "#6a6a82", marginTop: 4, fontFamily: '"JetBrains Mono", monospace' }}>
          {sub}
        </div>
      )}
    </div>
  );
}
