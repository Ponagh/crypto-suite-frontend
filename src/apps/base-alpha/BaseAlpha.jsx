import { useState, useEffect, useCallback, useRef } from "react";
import AlertFeed from "./AlertFeed";

/*
 * ═══════════════════════════════════════════════════════════════════════════════
 *  BASE ALPHA — Smart Money Intelligence Dashboard
 *  Production build: Real Supabase integration, no mock data
 *  Tables: alpha_tracked_wallets, alpha_alerts, alpha_subscribers
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Supabase REST Client (lightweight, no SDK dependency) ───────────────────
function createSupabaseClient(url, key) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  async function query(table, { select = "*", filters = {}, order, limit } = {}) {
    const params = new URLSearchParams();
    params.set("select", select);
    Object.entries(filters).forEach(([col, val]) => {
      if (typeof val === "object" && val.op) {
        params.set(col, `${val.op}.${val.value}`);
      } else {
        params.set(col, `eq.${val}`);
      }
    });
    if (order) params.set("order", order);
    if (limit) params.set("limit", String(limit));

    const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers });
    if (!res.ok) throw new Error(`Query ${table}: ${res.status} — ${await res.text()}`);
    return res.json();
  }

  async function insert(table, data) {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: "POST", headers, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Insert ${table}: ${res.status} — ${await res.text()}`);
    return res.json();
  }

  async function update(table, filters, data) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([col, val]) => params.set(col, `eq.${val}`));
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method: "PATCH", headers, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Update ${table}: ${res.status} — ${await res.text()}`);
    return res.json();
  }

  async function remove(table, filters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([col, val]) => params.set(col, `eq.${val}`));
    const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
      method: "DELETE", headers,
    });
    if (!res.ok) throw new Error(`Delete ${table}: ${res.status} — ${await res.text()}`);
    return res.status === 204 ? [] : res.json();
  }

  return { query, insert, update, remove };
}

// ─── Design Tokens ───────────────────────────────────────────────────────────
const font = `'IBM Plex Mono', 'JetBrains Mono', 'Fira Code', monospace`;
const fontSans = `'IBM Plex Sans', 'DM Sans', system-ui, sans-serif`;
const C = {
  bg: "#06060b", surface: "#0d0d16", surfaceRaised: "#13131f",
  border: "#1a1a2e", borderFocus: "#3366ff",
  text: "#dcdce5", textDim: "#6a6a82", textMuted: "#3d3d55",
  blue: "#3366ff", blueDim: "rgba(51,102,255,0.10)",
  green: "#00dc82", greenDim: "rgba(0,220,130,0.10)",
  red: "#ff4466", redDim: "rgba(255,68,102,0.10)",
  amber: "#ffaa00", amberDim: "rgba(255,170,0,0.10)",
  violet: "#8b5cf6", violetDim: "rgba(139,92,246,0.10)",
};

// ─── Utility Components ──────────────────────────────────────────────────────
function Pill({ children, color = C.blue, style }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "2px 7px",
      fontSize: 9, fontFamily: font, fontWeight: 600, letterSpacing: "0.1em",
      color, background: color + "18", borderRadius: 3,
      textTransform: "uppercase", whiteSpace: "nowrap", ...style,
    }}>{children}</span>
  );
}

function WalletTypePill({ type }) {
  const m = { market_maker: [C.blue, "MM"], whale: [C.violet, "WHALE"], smart_money: [C.green, "SMART $"], degen: [C.amber, "DEGEN"] };
  const [color, label] = m[type] || [C.textDim, type || "—"];
  return <Pill color={color}>{label}</Pill>;
}

function StatusDot({ active }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 9, fontFamily: font, fontWeight: 600,
      color: active ? C.green : C.textMuted,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: "50%",
        background: active ? C.green : C.textMuted,
        boxShadow: active ? `0 0 8px ${C.green}` : "none",
      }} />
      {active ? "ACTIVE" : "PAUSED"}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const styles = {
    primary: { background: C.blue, color: "#fff", border: "none" },
    ghost: { background: "transparent", color: C.textDim, border: `1px solid ${C.border}` },
    danger: { background: C.redDim, color: C.red, border: `1px solid ${C.red}22` },
    success: { background: C.greenDim, color: C.green, border: `1px solid ${C.green}22` },
    warning: { background: C.amberDim, color: C.amber, border: `1px solid ${C.amber}22` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "6px 12px", fontSize: 10, fontFamily: font, fontWeight: 600,
      borderRadius: 5, cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1, letterSpacing: "0.06em",
      transition: "all 0.15s", ...styles[variant], ...style,
    }}>{children}</button>
  );
}

function EmptyState({ icon, title, sub }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "60px 20px", color: C.textMuted,
    }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.textDim, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 11, maxWidth: 360, textAlign: "center", lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function Spinner({ size = 16 }) {
  return (
    <div style={{
      width: size, height: size, border: `2px solid ${C.border}`,
      borderTopColor: C.blue, borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
  );
}

// ─── Setup Screen ────────────────────────────────────────────────────────────
function SetupScreen({ onConnect }) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  const test = async () => {
    setTesting(true);
    setError("");
    try {
      const cleanUrl = url.replace(/\/$/, "");
      const client = createSupabaseClient(cleanUrl, key);
      await client.query("alpha_tracked_wallets", { limit: 1 });
      onConnect(cleanUrl, key);
    } catch (e) {
      setError(e.message || "Connection failed — check URL and anon key.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{
      fontFamily: font, background: C.bg, color: C.text,
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 440, padding: 32, background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${C.blue}, ${C.violet})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 900, color: "#fff",
          }}>α</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>BASE ALPHA</div>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: "0.15em" }}>CONNECT YOUR SUPABASE</div>
          </div>
        </div>

        <label style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em", display: "block", marginBottom: 4 }}>
          PROJECT URL
        </label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://xxxxx.supabase.co"
          style={{
            width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: font,
            background: C.bg, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 14, boxSizing: "border-box",
          }}
        />

        <label style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em", display: "block", marginBottom: 4 }}>
          ANON / PUBLIC KEY
        </label>
        <input value={key} onChange={e => setKey(e.target.value)} type="password"
          placeholder="eyJhbGciOiJIUzI1NiIs..."
          style={{
            width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: font,
            background: C.bg, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 18, boxSizing: "border-box",
          }}
        />

        {error && (
          <div style={{
            padding: "8px 12px", marginBottom: 14, borderRadius: 6,
            background: C.redDim, color: C.red, fontSize: 10, fontFamily: font,
            border: `1px solid ${C.red}22`, wordBreak: "break-all",
          }}>{error}</div>
        )}

        <Btn onClick={test} disabled={!url || !key || testing} style={{ width: "100%", padding: "10px 0", fontSize: 11 }}>
          {testing ? "TESTING CONNECTION..." : "CONNECT & LAUNCH"}
        </Btn>

        <div style={{ marginTop: 16, fontSize: 9, color: C.textMuted, lineHeight: 1.6 }}>
          Connects via Supabase REST API. Requires the <span style={{ color: C.textDim }}>alpha_tracked_wallets</span> table.
          Credentials are used in-memory only — never stored or transmitted elsewhere.
        </div>
      </div>
      <style>{globalCSS}</style>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ supabaseUrl, supabaseKey, onDisconnect }) {
  const db = useRef(createSupabaseClient(supabaseUrl, supabaseKey)).current;
  const [tab, setTab] = useState("wallets");
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState(null);
  const [form, setForm] = useState({ label: "", address: "", type: "whale" });
  const [adding, setAdding] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const activeCount = wallets.filter(w => w.is_active).length;
  const typeBreakdown = {};
  wallets.forEach(w => { typeBreakdown[w.type] = (typeBreakdown[w.type] || 0) + 1; });

  const fetchWallets = useCallback(async () => {
    try {
      setError("");
      const data = await db.query("alpha_tracked_wallets", { order: "added_at.desc" });
      setWallets(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(fetchWallets, 30000);
    return () => clearInterval(iv);
  }, [fetchWallets]);

  const addWallet = async () => {
    if (!form.label.trim() || !form.address.trim()) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(form.address.trim())) {
      setError("Invalid address — must be a 42-character hex address starting with 0x");
      return;
    }
    setAdding(true);
    try {
      await db.insert("alpha_tracked_wallets", {
        label: form.label.trim(),
        address: form.address.trim().toLowerCase(),
        type: form.type,
        is_active: true,
      });
      setForm({ label: "", address: "", type: "whale" });
      await fetchWallets();
    } catch (e) {
      setError(`Add failed: ${e.message}`);
    } finally {
      setAdding(false);
    }
  };

  const toggleActive = async (w) => {
    setActionId(w.id);
    try {
      await db.update("alpha_tracked_wallets", { id: w.id }, { is_active: !w.is_active });
      await fetchWallets();
    } catch (e) { setError(e.message); }
    finally { setActionId(null); }
  };

  const removeWallet = async (w) => {
    setActionId(w.id);
    try {
      await db.remove("alpha_tracked_wallets", { id: w.id });
      await fetchWallets();
    } catch (e) { setError(e.message); }
    finally { setActionId(null); }
  };

  const fmt = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " · " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  };
  const trunc = (a) => a ? `${a.slice(0, 6)}···${a.slice(-4)}` : "—";

  return (
    <div style={{ fontFamily: font, background: C.bg, color: C.text, minHeight: "100vh" }}>
      {/* Ambient */}
      <div style={{
        position: "fixed", top: -200, left: -100, width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.blue} 0%, transparent 70%)`,
        opacity: 0.035, pointerEvents: "none", filter: "blur(60px)",
      }} />

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 24px", borderBottom: `1px solid ${C.border}`,
        background: "rgba(6,6,11,0.85)", backdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `linear-gradient(135deg, ${C.blue}, ${C.violet})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 900, color: "#fff",
          }}>α</div>
          <span style={{ fontSize: 13, fontWeight: 700 }}>BASE ALPHA</span>
          <Pill color={C.textMuted} style={{ fontSize: 8 }}>
            {supabaseUrl.replace("https://", "").split(".")[0]}
          </Pill>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill color={C.green} style={{ gap: 4, display: "flex", alignItems: "center" }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%", background: C.green,
              animation: "pulse 2s infinite",
            }} />
            LIVE
          </Pill>
          <Btn variant="ghost" onClick={onDisconnect} style={{ fontSize: 9, padding: "4px 8px" }}>
            DISCONNECT
          </Btn>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: "rgba(6,6,11,0.6)" }}>
        {[
          { key: "wallets", label: "TRACKED WALLETS", count: wallets.length },
          { key: "alerts", label: "ALERT FEED" },
          { key: "subscription", label: "SUBSCRIPTION" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "11px 20px", fontSize: 10, fontWeight: 600,
            fontFamily: font, letterSpacing: "0.08em", cursor: "pointer",
            background: "transparent",
            color: tab === t.key ? C.blue : C.textMuted,
            border: "none",
            borderBottom: tab === t.key ? `2px solid ${C.blue}` : "2px solid transparent",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {t.label}
            {t.count !== undefined && (
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                background: tab === t.key ? C.blueDim : C.border,
                color: tab === t.key ? C.blue : C.textMuted,
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Error */}
      {error && (
        <div style={{
          margin: "12px 24px 0", padding: "10px 14px", borderRadius: 6,
          background: C.redDim, border: `1px solid ${C.red}22`,
          color: C.red, fontSize: 10, fontFamily: font,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ wordBreak: "break-word", flex: 1 }}>{error}</span>
          <button onClick={() => setError("")} style={{
            background: "none", border: "none", color: C.red, cursor: "pointer",
            fontSize: 14, fontFamily: font, marginLeft: 8,
          }}>×</button>
        </div>
      )}

      <main style={{ padding: "20px 24px" }}>

        {/* ═══ WALLETS ═══ */}
        {tab === "wallets" && (
          <>
            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
              {[
                { l: "TRACKED", v: wallets.length, c: C.blue },
                { l: "ACTIVE", v: activeCount, c: C.green },
                { l: "PAUSED", v: wallets.length - activeCount, c: C.amber },
                { l: "TYPES", v: Object.keys(typeBreakdown).length, c: C.violet },
              ].map(s => (
                <div key={s.l} style={{
                  padding: "14px 16px", background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                }}>
                  <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.12em", marginBottom: 6 }}>{s.l}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: s.c, fontFamily: fontSans }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Add Form */}
            <div style={{
              display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap",
              padding: "12px 14px", background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 8, alignItems: "flex-end",
            }}>
              <div style={{ flex: "1 1 130px" }}>
                <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 3 }}>LABEL</div>
                <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                  placeholder="e.g. Wintermute" style={inputStyle} />
              </div>
              <div style={{ flex: "2 1 200px" }}>
                <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 3 }}>ADDRESS</div>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="0x..." style={inputStyle} />
              </div>
              <div style={{ flex: "0 0 125px" }}>
                <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em", marginBottom: 3 }}>TYPE</div>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  style={{ ...inputStyle, appearance: "none" }}>
                  <option value="whale">Whale</option>
                  <option value="market_maker">Market Maker</option>
                  <option value="smart_money">Smart Money</option>
                  <option value="degen">Degen</option>
                </select>
              </div>
              <Btn onClick={addWallet} disabled={!form.label || !form.address || adding}
                style={{ padding: "8px 16px" }}>
                {adding ? "ADDING..." : "+ ADD"}
              </Btn>
              <Btn variant="ghost" onClick={fetchWallets} style={{ padding: "8px 10px" }} title="Refresh">
                ↻
              </Btn>
            </div>

            {/* Refresh indicator */}
            {lastRefresh && (
              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 10, textAlign: "right" }}>
                Last sync: {lastRefresh.toLocaleTimeString()} · auto-refreshes every 30s
              </div>
            )}

            {/* Table */}
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner size={24} /></div>
            ) : wallets.length === 0 ? (
              <EmptyState
                icon="◎"
                title="No wallets in database"
                sub="Add a wallet address above — it will be inserted into your alpha_tracked_wallets table in Supabase."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{
                  display: "grid", gridTemplateColumns: "1.8fr 1.4fr 75px 65px 105px 120px",
                  gap: 8, padding: "5px 14px",
                  fontSize: 9, color: C.textMuted, letterSpacing: "0.12em",
                }}>
                  <span>LABEL</span><span>ADDRESS</span><span>TYPE</span>
                  <span>STATUS</span><span>ADDED</span><span style={{ textAlign: "right" }}>ACTIONS</span>
                </div>

                {wallets.map(w => (
                  <div key={w.id} style={{
                    display: "grid", gridTemplateColumns: "1.8fr 1.4fr 75px 65px 105px 120px",
                    gap: 8, padding: "10px 14px", borderRadius: 6,
                    background: C.surface, border: `1px solid ${C.border}`,
                    fontSize: 11, alignItems: "center",
                    opacity: w.is_active ? 1 : 0.5,
                  }}>
                    <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.label}
                    </span>
                    <span
                      style={{ color: C.textDim, fontSize: 10, cursor: "pointer" }}
                      title={`Click to copy: ${w.address}`}
                      onClick={() => { navigator.clipboard?.writeText(w.address); }}
                    >
                      {trunc(w.address)}
                    </span>
                    <WalletTypePill type={w.type} />
                    <StatusDot active={w.is_active} />
                    <span style={{ fontSize: 9, color: C.textMuted }}>{fmt(w.added_at)}</span>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {actionId === w.id ? <Spinner size={14} /> : (
                        <>
                          <Btn variant={w.is_active ? "warning" : "success"} onClick={() => toggleActive(w)}
                            style={{ fontSize: 9, padding: "4px 8px" }}>
                            {w.is_active ? "PAUSE" : "START"}
                          </Btn>
                          <Btn variant="danger" onClick={() => removeWallet(w)}
                            style={{ fontSize: 9, padding: "4px 8px" }}>
                            DEL
                          </Btn>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Type breakdown */}
            {wallets.length > 0 && (
              <div style={{
                marginTop: 18, padding: "12px 14px", background: C.surface,
                border: `1px solid ${C.border}`, borderRadius: 8,
                display: "flex", gap: 16, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 9, color: C.textMuted, letterSpacing: "0.1em", alignSelf: "center" }}>
                  BREAKDOWN
                </span>
                {Object.entries(typeBreakdown).map(([type, count]) => (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <WalletTypePill type={type} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══ ALERTS ═══ */}
        {tab === "alerts" && (
          <AlertFeed supabaseUrl={supabaseUrl} supabaseKey={supabaseKey} />
        )}

        {/* ═══ SUBSCRIPTION — Phase 1.5 ═══ */}
        {tab === "subscription" && (
          <EmptyState
            icon="◆"
            title="Subscription — Next Phase"
            sub="Connect BaseAlphaSubscription.sol (ERC-721) + Stripe checkout. Needs alpha_subscribers table and webhook endpoints."
          />
        )}
      </main>

      <style>{globalCSS}</style>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "8px 10px", fontSize: 11,
  fontFamily: `'IBM Plex Mono', monospace`,
  background: "#06060b", color: "#dcdce5",
  border: "1px solid #1a1a2e", borderRadius: 5, boxSizing: "border-box",
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #06060b; }
  ::-webkit-scrollbar-thumb { background: #1a1a2e; border-radius: 4px; }
  input:focus, select:focus { outline: none; border-color: #3366ff !important; }
  input::placeholder { color: #3d3d55; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
`;

// ─── App Entry ───────────────────────────────────────────────────────────────
export default function BaseAlpha() {
  const [conn, setConn] = useState(null);

  if (!conn) return <SetupScreen onConnect={(url, key) => setConn({ url, key })} />;
  return <Dashboard supabaseUrl={conn.url} supabaseKey={conn.key} onDisconnect={() => setConn(null)} />;
}
