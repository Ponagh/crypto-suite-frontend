/**
 * ════════════════════════════════════════════════════════════════════════════
 *   ADMIN DASHBOARD — Session 1 deliverable
 *
 *   Renders:
 *     - System kill switch state + toggle (with confirmation)
 *     - List of LIVE agents with their policies + daily counters
 *     - Recent LIVE transactions
 *
 *   Auth: requires the connected wallet to match ADMIN_WALLET on the backend.
 *         All requests include X-Admin-Address header.
 *
 *   This is intentionally ugly. Function > polish in Session 1.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from './wallet-integration';

export default function Admin({ apiUrl }) {
  const { address, isConnected } = useWallet() || {};
  const [status, setStatus] = useState(null);
  const [agents, setAgents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [haltReason, setHaltReason] = useState('');

  const headers = address ? { 'X-Admin-Address': address } : {};

  const fetchAll = useCallback(async () => {
    if (!isConnected || !address || !apiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const [sRes, aRes, tRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/status`, { headers }),
        fetch(`${apiUrl}/api/admin/live-agents`, { headers }),
        fetch(`${apiUrl}/api/admin/recent-transactions`, { headers }),
      ]);
      if (sRes.status === 401) throw new Error('Unauthorized — wallet not registered as ADMIN_WALLET');
      if (sRes.status === 503) throw new Error('Admin disabled — ADMIN_WALLET env not set on backend');
      const s = await sRes.json();
      const a = await aRes.json();
      const t = await tRes.json();
      setStatus(s.status || null);
      setAgents(a.agents || []);
      setTransactions(t.transactions || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected, apiUrl]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!isConnected) return;
    const iv = setInterval(fetchAll, 10_000);
    return () => clearInterval(iv);
  }, [isConnected, fetchAll]);

  const handleKillSwitch = async (enabled) => {
    const action = enabled ? 'ENABLE LIVE TRADING' : 'HALT LIVE TRADING';
    const reason = enabled ? null : (haltReason || window.prompt('Reason for halt?') || 'Halted by admin');
    if (!window.confirm(`${action}? This affects ALL agents system-wide.`)) return;
    try {
      const res = await fetch(`${apiUrl}/api/admin/emergency-stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ enabled, reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setStatus(json.status);
      setHaltReason('');
    } catch (e) {
      alert(`Failed: ${e.message}`);
    }
  };

  if (!isConnected) {
    return <Pane><H1>ADMIN</H1><P>Connect wallet to access admin console.</P></Pane>;
  }

  if (error) {
    return <Pane><H1>ADMIN</H1><P style={{ color: '#ff2d92' }}>Error: {error}</P><Button onClick={fetchAll}>Retry</Button></Pane>;
  }

  if (loading && !status) {
    return <Pane><H1>ADMIN</H1><P>Loading...</P></Pane>;
  }

  const killOn = status?.live_trading_enabled;

  return (
    <Pane>
      <H1>ADMIN CONSOLE</H1>
      <P style={{ opacity: 0.6 }}>Connected as: {address}</P>

      {/* ─── KILL SWITCH ──────────────────────────────────────────── */}
      <Section title="SYSTEM STATUS">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 12 }}>
          <div style={{
            padding: '8px 16px',
            background: killOn ? 'rgba(0,255,136,0.15)' : 'rgba(255,45,146,0.15)',
            border: `1px solid ${killOn ? '#00ff88' : '#ff2d92'}`,
            color: killOn ? '#00ff88' : '#ff2d92',
            fontWeight: 700,
            fontFamily: 'monospace',
          }}>
            LIVE TRADING: {killOn ? 'ENABLED' : 'HALTED'}
          </div>
          {!killOn && status?.halt_reason && (
            <span style={{ color: '#dcdce5', opacity: 0.7 }}>reason: {status.halt_reason}</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {killOn ? (
            <>
              <input
                type="text"
                value={haltReason}
                onChange={e => setHaltReason(e.target.value)}
                placeholder="Reason for halt (optional)"
                style={{
                  padding: 8,
                  background: '#0a0a10',
                  border: '1px solid #333',
                  color: '#dcdce5',
                  fontFamily: 'monospace',
                  minWidth: 300,
                }}
              />
              <Button onClick={() => handleKillSwitch(false)} danger>🛑 HALT ALL LIVE TRADING</Button>
            </>
          ) : (
            <Button onClick={() => handleKillSwitch(true)}>✅ RESUME LIVE TRADING</Button>
          )}
        </div>

        {status && (
          <SmallGrid>
            <Kv k="Max gas gwei" v={status.max_gas_gwei} />
            <Kv k="System daily trade limit" v={status.daily_trade_limit} />
            <Kv k="Last updated" v={fmtDate(status.updated_at)} />
            {status.halted_at && <Kv k="Halted at" v={fmtDate(status.halted_at)} />}
            {status.halted_by && <Kv k="Halted by" v={status.halted_by} />}
          </SmallGrid>
        )}
      </Section>

      {/* ─── LIVE AGENTS ──────────────────────────────────────────── */}
      <Section title={`LIVE AGENTS (${agents.length})`}>
        {agents.length === 0 ? (
          <P style={{ opacity: 0.6 }}>No agents currently in LIVE mode.</P>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Agent</th>
                <th style={th}>Owner</th>
                <th style={th}>Status</th>
                <th style={th}>Policy</th>
                <th style={th}>Capital</th>
                <th style={th}>Daily trades</th>
                <th style={th}>Daily volume</th>
                <th style={th}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(a => (
                <tr key={a.id} style={{ borderTop: '1px solid #222' }}>
                  <td style={td}>{a.strategy_name} <br/><span style={{ opacity: 0.5 }}>{a.id}</span></td>
                  <td style={td}>{shortAddr(a.owner_address)}</td>
                  <td style={td}>{a.status}</td>
                  <td style={td}>{a.policy?.live_trading_enabled ? '✅ active' : '❌ disabled'}</td>
                  <td style={td}>${Number(a.capital || 0).toFixed(2)}</td>
                  <td style={td}>{a.daily_count}/{a.policy?.daily_trade_limit ?? '–'}</td>
                  <td style={td}>${Number(a.daily_volume_usd || 0).toFixed(2)} / ${a.policy?.daily_volume_usd_cap ?? '–'}</td>
                  <td style={{ ...td, color: Number(a.pnl) >= 0 ? '#00ff88' : '#ff2d92' }}>
                    ${Number(a.pnl || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* ─── RECENT TRANSACTIONS ──────────────────────────────────── */}
      <Section title={`RECENT LIVE TRANSACTIONS (${transactions.length})`}>
        {transactions.length === 0 ? (
          <P style={{ opacity: 0.6 }}>No LIVE transactions yet.</P>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>When</th>
                <th style={th}>Agent</th>
                <th style={th}>Action</th>
                <th style={th}>Status</th>
                <th style={th}>Size</th>
                <th style={th}>Tx / Error</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid #222' }}>
                  <td style={td}>{fmtDate(t.created_at)}</td>
                  <td style={td}>{t.agent_id}</td>
                  <td style={td}>{t.action} {t.asset_in && `${t.asset_in}→${t.asset_out}`}</td>
                  <td style={{ ...td, color: statusColor(t.status) }}>{t.status}</td>
                  <td style={td}>{t.amount_in_usd ? `$${Number(t.amount_in_usd).toFixed(2)}` : '–'}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>
                    {t.tx_hash ? t.tx_hash.slice(0, 16) + '…'
                     : t.error_message ? <span style={{ color: '#ff2d92' }}>{t.error_message}</span>
                     : t.preflight_reason ? <span style={{ color: '#ff9500' }}>preflight: {t.preflight_reason}</span>
                     : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <P style={{ opacity: 0.4, marginTop: 32, fontSize: 11 }}>
        Auto-refreshes every 10s. All admin actions are logged. Kill switch is checked on every LIVE tick.
      </P>
    </Pane>
  );
}

// ─── Tiny styled helpers (no external deps) ─────────────────────────────────

const Pane = ({ children }) => (
  <div style={{
    minHeight: 'calc(100vh - 60px)',
    background: '#04040a',
    color: '#dcdce5',
    padding: 24,
    fontFamily: 'monospace',
  }}>{children}</div>
);

const H1 = ({ children }) => (
  <h1 style={{ fontSize: 24, margin: 0, marginBottom: 4, letterSpacing: '0.15em', color: '#00ffee' }}>{children}</h1>
);

const P = ({ children, style }) => (
  <p style={{ margin: '8px 0', ...style }}>{children}</p>
);

const Section = ({ title, children }) => (
  <section style={{
    margin: '24px 0',
    padding: 16,
    background: 'rgba(10,10,20,0.5)',
    border: '1px solid #1a1a2e',
    borderRadius: 4,
  }}>
    <h2 style={{
      fontSize: 12,
      letterSpacing: '0.2em',
      color: '#6a6a82',
      margin: 0,
      marginBottom: 12,
    }}>{title}</h2>
    {children}
  </section>
);

const Button = ({ children, onClick, danger }) => (
  <button
    onClick={onClick}
    style={{
      padding: '8px 16px',
      background: danger ? 'rgba(255,45,146,0.15)' : 'rgba(0,255,238,0.15)',
      border: `1px solid ${danger ? '#ff2d92' : '#00ffee'}`,
      color: danger ? '#ff2d92' : '#00ffee',
      fontFamily: 'monospace',
      fontWeight: 700,
      cursor: 'pointer',
      letterSpacing: '0.1em',
    }}
  >{children}</button>
);

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const th = { textAlign: 'left', padding: '8px 12px', color: '#6a6a82', fontWeight: 400, letterSpacing: '0.1em', fontSize: 10 };
const td = { padding: '10px 12px', verticalAlign: 'top' };

const SmallGrid = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
    {children}
  </div>
);

const Kv = ({ k, v }) => (
  <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid #1a1a2e' }}>
    <div style={{ fontSize: 9, color: '#6a6a82', letterSpacing: '0.15em' }}>{k}</div>
    <div style={{ fontSize: 13, color: '#dcdce5' }}>{v ?? '–'}</div>
  </div>
);

function fmtDate(s) {
  if (!s) return '–';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

function shortAddr(a) {
  if (!a) return '–';
  return a.slice(0, 6) + '…' + a.slice(-4);
}

function statusColor(s) {
  if (s === 'confirmed') return '#00ff88';
  if (s === 'failed' || s === 'reverted') return '#ff2d92';
  if (s === 'rejected_preflight') return '#ff9500';
  return '#dcdce5';
}
