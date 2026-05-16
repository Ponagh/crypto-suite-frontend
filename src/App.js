import React, { useState, useEffect } from 'react';
import { ConnectButton, useWallet } from './wallet-integration';
import BaseAlpha from './apps/base-alpha/BaseAlpha';
import YieldPilot from './yield-pilot';
import AgentForge from './agent-forge';
import Admin from './admin';
import './App.css';

const API_URL = process.env.REACT_APP_API_BASE || 'https://crypto-suite-backend-production.up.railway.app';
const ADMIN_WALLET = '0x27b234fe6cccba56e82d3310e2cc5ce59480c59e';

const BASE_APPS = [
  { id: 'alpha', label: 'Base Alpha', icon: '⚡' },
  { id: 'yield', label: 'YieldPilot', icon: '📊' },
  { id: 'forge', label: 'AgentForge', icon: '🤖' },
];

function AppContent() {
  const [activeApp, setActiveApp] = useState('alpha');
  const { address, isConnected } = useWallet();

  // Admin: wallet must be connected AND match ADMIN_WALLET.
  // Re-evaluates whenever address changes (handles mobile wallet reconnect).
  const isAdmin = !!(address && address.toLowerCase() === ADMIN_WALLET);

  const APPS = isAdmin
    ? [...BASE_APPS, { id: 'admin', label: 'Admin', icon: '⚙' }]
    : BASE_APPS;

  // If admin tab was active but wallet disconnected, fall back to alpha
  useEffect(() => {
    if (activeApp === 'admin' && !isAdmin) setActiveApp('alpha');
  }, [isAdmin, activeApp]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* ── Nav Bar ──────────────────────────────────────────────────── */}
      <nav className="app-nav">
        <div className="app-nav-tabs">
          {APPS.map(app => (
            <button
              key={app.id}
              onClick={() => setActiveApp(app.id)}
              className={`app-nav-tab ${activeApp === app.id ? 'active' : ''}`}
            >
              <span>{app.icon}</span>
              <span className="app-nav-label">{app.label}</span>
            </button>
          ))}
        </div>
        <div className="app-nav-right">
          {isConnected && (
            <span className="app-nav-status">
              <span className="app-nav-dot" />
              <span className="app-nav-network">Base</span>
            </span>
          )}
          <ConnectButton />
        </div>
      </nav>

      {/* ── Active App ────────────────────────────────────────────────── */}
      <div style={{ flex: 1 }}>
        {activeApp === 'alpha' && <BaseAlpha apiUrl={API_URL} />}
        {activeApp === 'yield' && <YieldPilot apiUrl={API_URL} />}
        {activeApp === 'forge' && <AgentForge apiUrl={API_URL} />}
        {activeApp === 'admin' && isAdmin && <Admin apiUrl={API_URL} />}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
        fontSize: 11,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'var(--font-mono, monospace)',
        letterSpacing: '0.05em',
        background: 'rgba(0,0,0,0.4)',
      }}>
        <span>ARCA · BASE MAINNET · PRIVATE BETA · © 2026</span>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <a
            href="https://base-alpha-landing.vercel.app/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}
          >
            Privacy Policy
          </a>
          <a
            href="https://basescan.org/address/0x8d0420fe81C3499D414ac3dEB2f37E8F5297df9F"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}
          >
            Contracts ↗
          </a>
          <a
            href="https://base-alpha-landing.vercel.app"
            style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}
          >
            About
          </a>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return <AppContent />;
}

export default App;
