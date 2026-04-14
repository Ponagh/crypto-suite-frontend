import React, { useState } from 'react';
import { WalletProvider, ConnectButton, useWallet } from './wallet-integration';
import BaseAlpha from './base-alpha';
import YieldPilot from './yield-pilot';
import AgentForge from './agent-forge';
import './App.css';

const API_URL = 'https://crypto-suite-backend-production.up.railway.app';

const APPS = [
  { id: 'alpha', label: 'Base Alpha', icon: '⚡' },
  { id: 'yield', label: 'YieldPilot', icon: '📊' },
  { id: 'forge', label: 'AgentForge', icon: '🤖' },
];

function AppContent() {
  const [activeApp, setActiveApp] = useState('alpha');
  const { address, isConnected } = useWallet();

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
    </div>
  );
}

function App() {
  return (
    <WalletProvider>
      <AppContent />
    </WalletProvider>
  );
}

export default App;
