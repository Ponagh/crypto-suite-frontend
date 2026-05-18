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

// Storage key for which tab the user was last on. Localized so the value
// is namespaced and won't collide with anything else in localStorage.
const ACTIVE_APP_STORAGE_KEY = 'sovereign.activeApp';

// Read the last-active tab on first render. Falls back to 'alpha' for new
// users or anyone whose localStorage is wiped / blocked. Wrapped in try/catch
// because localStorage can throw in private browsing or Safari iframe contexts.
function readInitialApp() {
  try {
    const stored = window.localStorage?.getItem(ACTIVE_APP_STORAGE_KEY);
    // Only restore values we recognize — guards against stale tab IDs from
    // older builds (e.g. if we rename or remove a tab later).
    if (stored && ['alpha', 'yield', 'forge', 'admin'].includes(stored)) {
      return stored;
    }
  } catch (_) {
    // ignore — fall through to default
  }
  return 'alpha';
}

function AppContent() {
  // Initialize from storage so refresh keeps the user on the same tab they
  // were viewing. Previously this was useState('alpha') which forced every
  // refresh back to Base Alpha — annoying when monitoring AgentForge.
  const [activeApp, setActiveApp] = useState(readInitialApp);
  const { address, isConnected } = useWallet();

  const isAdmin = address && address.toLowerCase() === ADMIN_WALLET;

  // Persist the active tab whenever it changes. We also guard against the
  // admin tab being persisted by a non-admin wallet (would be a no-op since
  // the tab wouldn't render, but cleaner to never write it for non-admins).
  useEffect(() => {
    try {
      if (activeApp === 'admin' && !isAdmin) return;
      window.localStorage?.setItem(ACTIVE_APP_STORAGE_KEY, activeApp);
    } catch (_) {
      // localStorage unavailable — silently drop. The user just loses
      // persistence; everything else still works.
    }
  }, [activeApp, isAdmin]);

  // If a non-admin wallet had been on the admin tab (somehow), bounce them
  // to Base Alpha. This shouldn't happen in practice but covers the edge
  // case of switching wallets after the page is already loaded.
  useEffect(() => {
    if (activeApp === 'admin' && !isAdmin) {
      setActiveApp('alpha');
    }
  }, [activeApp, isAdmin]);

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
  return <AppContent />;
}

export default App;
