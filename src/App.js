import React, { useState } from 'react';
import { ConnectButton, useWallet } from './wallet-integration';
import BaseAlpha from './apps/base-alpha/BaseAlpha';
import YieldPilot from './yield-pilot';
import AgentForge from './agent-forge';
import Admin from './admin';
import './App.css';

const API_URL = 'https://crypto-suite-backend-production.up.railway.app';
const ADMIN_WALLET = '0x27b234fe6cccba56e82d3310e2cc5ce59480c59e';

const BASE_APPS = [
  { id: 'alpha', label: 'Base Alpha', icon: '⚡' },
  { id: 'yield', label: 'YieldPilot', icon: '📊' },
  { id: 'forge', label: 'AgentForge', icon: '🤖' },
];

function AppContent() {
  const [activeApp, setActiveApp] = useState('alpha');
  const { address, isConnected } = useWallet();

  const isAdmin = address && address.toLowerCase() === ADMIN_WALLET;

  const APPS = isAdmin
    ? [...BASE_APPS, { id: 'admin', label: 'Admin', icon: '⚙️' }]
    : BASE_APPS;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Nav Bar */}
      <nav className="app-nav">
        <div className="app-nav-tabs">
          {APPS.map(app => (
            <button
              key={app.id}
              onClick={() => setActiveApp(app.id)}
              className={`app-nav-tab ${activeApp === app.id ? 'active' : ''}`}
            >
              <span>{app.icon}</span>
              {app.label}
            </button>
          ))}
        </div>
        <div className="app-nav-right">
          {isConnected && (
            <span className="app-nav-status">
              <span className="app-nav-dot" />
              Base Mainnet
            </span>
          )}
          <ConnectButton />
        </div>
      </nav>

      {/* Active App */}
      {activeApp === 'alpha' && <BaseAlpha apiUrl={API_URL} />}
      {activeApp === 'yield' && <YieldPilot apiUrl={API_URL} />}
      {activeApp === 'forge' && <AgentForge apiUrl={API_URL} />}
      {activeApp === 'admin' && isAdmin && <Admin apiUrl={API_URL} />}
    </div>
  );
}

function App() {
  return (
    <AppContent />
  );
}

export default App;
