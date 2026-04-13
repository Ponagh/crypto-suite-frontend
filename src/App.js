import React, { useState } from 'react';
import { WalletProvider, ConnectButton, useWallet } from './wallet-integration';
import BaseAlpha from './base-alpha';
import YieldPilot from './yield-pilot';
import AgentForge from './agent-forge';

const API_URL = 'https://crypto-suite-backend-production.up.railway.app';

function AppContent() {
  const [activeApp, setActiveApp] = useState('alpha');
  const { address, isConnected } = useWallet();

  return (
    <div style={{ minHeight: '100vh', background: '#07080a' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 16px',
        background: '#0a0c10',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'sticky',
        top: 0,
        zIndex: 999,
      }}>
        {/* App Tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'alpha', label: '⚡ Base Alpha', color: '#00ff88' },
            { id: 'yield', label: '📊 YieldPilot', color: '#60a5fa' },
            { id: 'forge', label: '🤖 AgentForge', color: '#a78bfa' },
          ].map(app => (
            <button
              key={app.id}
              onClick={() => setActiveApp(app.id)}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: activeApp === app.id
                  ? `1px solid ${app.color}40`
                  : '1px solid transparent',
                background: activeApp === app.id
                  ? `${app.color}12`
                  : 'transparent',
                color: activeApp === app.id ? app.color : '#8a8f98',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif',
                transition: 'all 0.2s ease',
              }}
            >
              {app.label}
            </button>
          ))}
        </div>

        {/* Wallet Connect */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isConnected && (
            <span style={{
              color: '#22c55e',
              fontSize: 11,
              fontFamily: 'monospace',
            }}>
              Base Network
            </span>
          )}
          <ConnectButton />
        </div>
      </div>

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