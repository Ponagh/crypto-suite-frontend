import React, { useState, useEffect, useCallback } from 'react';

/*
 * AlertFeed — reads from alpha_alerts table in Supabase
 * Schema: id, tx_hash, wallet_label, wallet_address, wallet_type,
 *         action, token, amount_raw, amount_usd, block, confidence (int), created_at
 */

function createClient(url, key) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  return {
    async query(table, { select = '*', order, limit, filters = {} } = {}) {
      const params = new URLSearchParams();
      params.set('select', select);
      Object.entries(filters).forEach(([col, val]) => {
        if (typeof val === 'object' && val.op) {
          params.set(col, `${val.op}.${val.value}`);
        } else {
          params.set(col, `eq.${val}`);
        }
      });
      if (order) params.set('order', order);
      if (limit) params.set('limit', String(limit));
      const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers });
      if (!res.ok) throw new Error(`Query failed: ${res.status}`);
      return res.json();
    },
  };
}

const font = `'IBM Plex Mono', 'JetBrains Mono', monospace`;
const C = {
  bg: '#06060b', surface: '#0d0d16', border: '#1a1a2e',
  text: '#dcdce5', textDim: '#6a6a82', textMuted: '#3d3d55',
  blue: '#3366ff', blueDim: 'rgba(51,102,255,0.10)',
  green: '#00dc82', greenDim: 'rgba(0,220,130,0.10)',
  red: '#ff4466', redDim: 'rgba(255,68,102,0.10)',
  amber: '#ffaa00', amberDim: 'rgba(255,170,0,0.10)',
  violet: '#8b5cf6',
};

function Pill({ children, color = C.blue }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 7px',
      fontSize: 9, fontFamily: font, fontWeight: 600, letterSpacing: '0.1em',
      color, background: color + '18', borderRadius: 3,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function ActionPill({ action }) {
  const map = {
    BUY: C.green, SELL: C.red, SWAP: C.blue, TRANSFER: C.violet,
    LP_ADD: C.amber, LP_REMOVE: C.red, MINT: C.green, BURN: C.red,
    APPROVE: C.textDim,
  };
  return <Pill color={map[(action || '').toUpperCase()] || C.textDim}>{(action || '—').replace('_', ' ')}</Pill>;
}

// confidence is integer: 3=HIGH, 2=MEDIUM, 1=LOW
function ConfDot({ level }) {
  const label = level >= 3 ? 'HIGH' : level === 2 ? 'MED' : 'LOW';
  const c = level >= 3 ? C.green : level === 2 ? C.amber : C.red;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, color: c, fontFamily: font }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c, boxShadow: `0 0 6px ${c}` }} />
      {label}
    </span>
  );
}

function Spinner({ size = 16 }) {
  return (
    <div style={{
      width: size, height: size, border: `2px solid ${C.border}`,
      borderTopColor: C.blue, borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );
}

export default function AlertFeed({ supabaseUrl, supabaseKey }) {
  const [db] = useState(() => createClient(supabaseUrl, supabaseKey));
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');
  const [filterConf, setFilterConf] = useState('ALL');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      setError('');
      const filters = {};
      if (filterAction !== 'ALL') filters.action = filterAction;
      if (filterConf !== 'ALL') filters.confidence = filterConf;

      const data = await db.query('alpha_alerts', {
        order: 'created_at.desc',
        limit: 100,
        filters,
      });
      setAlerts(data);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [db, filterAction, filterConf]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(fetchAlerts, 10000);
    return () => clearInterval(iv);
  }, [fetchAlerts, autoRefresh]);

  const timeAgo = (ts) => {
    const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const trunc = (a) => a ? `${a.slice(0, 6)}···${a.slice(-4)}` : '—';

  const selStyle = {
    padding: '6px 10px', fontSize: 10, fontFamily: font,
    background: C.surface, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 5, appearance: 'none',
  };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setAutoRefresh(!autoRefresh)} style={{
          padding: '6px 12px', fontSize: 10, fontFamily: font, fontWeight: 600,
          background: autoRefresh ? C.greenDim : C.redDim,
          color: autoRefresh ? C.green : C.red,
          border: `1px solid ${(autoRefresh ? C.green : C.red) + '33'}`,
          borderRadius: 5, cursor: 'pointer', letterSpacing: '0.06em',
        }}>
          {autoRefresh ? '● LIVE' : '○ PAUSED'}
        </button>

        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selStyle}>
          <option value="ALL">ALL ACTIONS</option>
          <option value="BUY">BUY</option>
          <option value="SELL">SELL</option>
          <option value="SWAP">SWAP</option>
          <option value="TRANSFER">TRANSFER</option>
          <option value="LP_ADD">LP ADD</option>
          <option value="LP_REMOVE">LP REMOVE</option>
          <option value="MINT">MINT</option>
          <option value="APPROVE">APPROVE</option>
        </select>

        <select value={filterConf} onChange={e => setFilterConf(e.target.value)} style={selStyle}>
          <option value="ALL">ALL CONFIDENCE</option>
          <option value="3">HIGH (3)</option>
          <option value="2">MEDIUM (2)</option>
          <option value="1">LOW (1)</option>
        </select>

        <button onClick={fetchAlerts} style={{
          padding: '6px 10px', fontSize: 12, fontFamily: font,
          background: 'transparent', color: C.textDim,
          border: `1px solid ${C.border}`, borderRadius: 5, cursor: 'pointer',
        }}>↻</button>

        <div style={{ marginLeft: 'auto', fontSize: 9, color: C.textMuted, fontFamily: font }}>
          {alerts.length} alerts · {lastRefresh ? `synced ${lastRefresh.toLocaleTimeString()}` : ''} · {autoRefresh ? 'polling 10s' : 'paused'}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 12, borderRadius: 6,
          background: C.redDim, border: `1px solid ${C.red}22`,
          color: C.red, fontSize: 10, fontFamily: font,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{
            background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 14,
          }}>×</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size={24} /></div>
      ) : alerts.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '60px 20px', color: C.textMuted,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>◈</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textDim, marginBottom: 4 }}>No alerts yet</div>
          <div style={{ fontSize: 11, maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
            Alerts appear here when your Alchemy webhook detects on-chain activity from tracked wallets and writes to the alpha_alerts table.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1.5fr 75px 1fr 90px 55px 75px 60px',
            gap: 8, padding: '5px 14px',
            fontSize: 9, color: C.textMuted, letterSpacing: '0.12em', fontFamily: font,
          }}>
            <span>WALLET</span><span>ACTION</span><span>TOKEN</span>
            <span>USD</span><span>CONF</span><span>TX</span><span>TIME</span>
          </div>

          {alerts.map((a, i) => (
            <div key={a.id} style={{
              display: 'grid', gridTemplateColumns: '1.5fr 75px 1fr 90px 55px 75px 60px',
              gap: 8, padding: '10px 14px', borderRadius: 6,
              background: C.surface, border: `1px solid ${C.border}`,
              fontSize: 11, fontFamily: font, alignItems: 'center',
              animation: i === 0 ? 'fadeSlide 0.3s ease-out' : 'none',
            }}>
              {/* Wallet */}
              <div>
                <div style={{ fontWeight: 600, fontSize: 11 }}>{a.wallet_label || trunc(a.wallet_address)}</div>
                {a.wallet_label && (
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 1 }}>{trunc(a.wallet_address)}</div>
                )}
                {a.wallet_type && (
                  <Pill color={
                    a.wallet_type === 'market_maker' ? C.blue :
                    a.wallet_type === 'whale' ? C.violet :
                    a.wallet_type === 'smart_money' ? C.green :
                    a.wallet_type === 'exchange' ? C.amber : C.textDim
                  }>{a.wallet_type.replace('_', ' ')}</Pill>
                )}
              </div>

              {/* Action */}
              <ActionPill action={a.action} />

              {/* Token + amount_raw */}
              <div>
                <span style={{ fontWeight: 600 }}>{a.token || '—'}</span>
                {a.amount_raw && (
                  <div style={{ color: C.textDim, fontSize: 9, marginTop: 1 }}>
                    {a.amount_raw.length > 12 ? a.amount_raw.slice(0, 12) + '...' : a.amount_raw}
                  </div>
                )}
              </div>

              {/* USD */}
              <span style={{ color: C.green, fontWeight: 600, fontSize: 11 }}>
                {a.amount_usd ? `$${Number(a.amount_usd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
              </span>

              {/* Confidence (integer) */}
              <ConfDot level={a.confidence || 1} />

              {/* TX Hash */}
              {a.tx_hash ? (
                <a
                  href={`https://basescan.org/tx/${a.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.blue, fontSize: 9, textDecoration: 'none' }}
                  title={a.tx_hash}
                >
                  {trunc(a.tx_hash)}
                </a>
              ) : (
                <span style={{ color: C.textMuted, fontSize: 9 }}>—</span>
              )}

              {/* Time */}
              <span style={{ color: C.textMuted, fontSize: 9, textAlign: 'right' }}>
                {timeAgo(a.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
