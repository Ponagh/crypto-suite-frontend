/**
 * wallet-integration.js — React Hooks + ConnectButton
 * Sovereign Crypto Suite — Phase 4 (Mobile-first + WalletConnect)
 *
 * ── Wallet Support ────────────────────────────────────────────
 *   - EIP-6963 multi-wallet discovery (MetaMask, Coinbase, Phantom, etc.)
 *   - WalletConnect v2 for mobile QR/deeplink connections
 *   - Legacy window.ethereum fallback for older wallets
 *   - In-app browser detection (Phantom, Rainbow, MetaMask Mobile)
 *
 * ── Contract Addresses (Base Mainnet) — ALL LIVE ───────────────
 *   BaseAlphaSubscription : 0xbB0740BDcB1927bdDC37f07f8a9B3291d35e1139
 *   YieldPilotVault       : 0x671025e627244D92FdF13A30A2Ad42fDfedeD0f6
 *   AgentForgeRegistry    : 0xa67421E8d9119247708c4474BE3Dc76567fC618f
 */

import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────
// CONTRACT ADDRESSES — all confirmed live on Base mainnet
// ─────────────────────────────────────────────────────────────
export const CONTRACTS = {
  BaseAlphaSubscription: "0xbB0740BDcB1927bdDC37f07f8a9B3291d35e1139",
  YieldPilotVault:       "0x671025e627244D92FdF13A30A2Ad42fDfedeD0f6",
  AgentForgeRegistry:    "0xa67421E8d9119247708c4474BE3Dc76567fC618f",
};

export const BASE_CHAIN_ID = 8453;

// ─────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────
const ABI_BASE_ALPHA = [
  "function subscribe() external payable",
  "function isSubscribed(address user) view returns (bool)",
  "function subscriptionExpiry(address user) view returns (uint256)",
  "function SUBSCRIPTION_PRICE() view returns (uint256)",
];

const ABI_YIELD_PILOT = [
  "function deposit(uint256 amount)",
  "function withdraw(uint256 sharesToWithdraw)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function totalDeposits() view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function paused() view returns (bool)",
  "function positions(address) view returns (uint256 deposited, uint256 shares, uint256 depositTimestamp)",
  "function getPositionValue(address) view returns (uint256 currentValue, uint256 costBasis, int256 pnl)",
];

const ABI_AGENT_FORGE = [
  "function subscribe(uint8 tier) external payable",
  "function registerAgent(string metadataURI) external",
  "function isActive(address) view returns (bool)",
  "function getSubscription(address) view returns (uint8 tier, uint256 expiry, uint256 agentsUsed, uint256 agentsAllowed)",
  "function getOwnerAgents(address) view returns (uint256[])",
  "function priceStarter() view returns (uint256)",
  "function pricePro() view returns (uint256)",
  "function priceEnterprise() view returns (uint256)",
];

const ABI_USDC = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getReadProvider() {
  return new ethers.JsonRpcProvider("https://mainnet.base.org");
}

async function getSigner() {
  if (!window.ethereum) throw new Error("No wallet detected");
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

async function ensureBaseChain(signer) {
  const network = await signer.provider.getNetwork();
  if (Number(network.chainId) !== BASE_CHAIN_ID) {
    throw new Error("Please switch to Base network");
  }
}

// ─────────────────────────────────────────────────────────────
// EIP-6963 WALLET DISCOVERY
// ─────────────────────────────────────────────────────────────

/**
 * Discovers all EIP-6963 compliant wallets injected into the page.
 * Returns an array of { info, provider } where info has { uuid, name, icon, rdns }.
 * Falls back to window.ethereum if no EIP-6963 wallets found.
 */
function useDiscoveredWallets() {
  const [wallets, setWallets] = useState([]);

  useEffect(() => {
    const discovered = [];

    const handler = (event) => {
      const { info, provider } = event.detail || {};
      if (!info || !provider) return;
      // Deduplicate by rdns
      if (!discovered.find(w => w.info.rdns === info.rdns)) {
        discovered.push({ info, provider });
        setWallets([...discovered]);
      }
    };

    window.addEventListener("eip6963:announceProvider", handler);
    // Request announcements from all wallets
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Give wallets 500ms to respond, then check if we need the legacy fallback
    const timeout = setTimeout(() => {
      if (discovered.length === 0 && window.ethereum) {
        // No EIP-6963 wallets, but window.ethereum exists (legacy)
        const name = window.ethereum.isMetaMask ? "MetaMask"
          : window.ethereum.isPhantom ? "Phantom"
          : window.ethereum.isCoinbaseWallet ? "Coinbase Wallet"
          : window.ethereum.isRabby ? "Rabby"
          : window.ethereum.isBraveWallet ? "Brave"
          : "Browser Wallet";
        discovered.push({
          info: { uuid: "legacy", name, icon: null, rdns: "legacy.injected" },
          provider: window.ethereum,
        });
        setWallets([...discovered]);
      }
    }, 500);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handler);
      clearTimeout(timeout);
    };
  }, []);

  return wallets;
}

// ─────────────────────────────────────────────────────────────
// MOBILE DETECTION
// ─────────────────────────────────────────────────────────────

function isMobile() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function isInAppBrowser() {
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes("phantom") || ua.includes("rainbow") ||
    ua.includes("metamask") || ua.includes("coinbase") ||
    ua.includes("trust") || (isMobile() && window.ethereum);
}

/**
 * Generate deeplink URLs for popular mobile wallets.
 * These open the wallet app directly with a connection request.
 */
function getWalletDeeplinks() {
  const currentUrl = encodeURIComponent(window.location.href);
  return [
    { name: "MetaMask", icon: "🦊", url: `https://metamask.app.link/dapp/${window.location.host}` },
    { name: "Coinbase Wallet", icon: "🔵", url: `https://go.cb-w.com/dapp?cb_url=${currentUrl}` },
    { name: "Phantom", icon: "👻", url: `https://phantom.app/ul/browse/${currentUrl}` },
    { name: "Rainbow", icon: "🌈", url: `https://rnbwapp.com/dapp?url=${currentUrl}` },
    { name: "Trust Wallet", icon: "🛡️", url: `https://link.trustwallet.com/open_url?coin_id=8453&url=${currentUrl}` },
  ];
}

// ─────────────────────────────────────────────────────────────
// useWallet — main hook (exported directly)
// ─────────────────────────────────────────────────────────────

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeProvider, setActiveProvider] = useState(null);
  const [walletName, setWalletName] = useState(null);

  const connectWithProvider = useCallback(async (provider, name) => {
    setLoading(true);
    setError(null);
    try {
      if (!provider) throw new Error("No wallet provider");
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const ethersProvider = new ethers.BrowserProvider(provider);
      const network = await ethersProvider.getNetwork();
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
      setConnected(true);
      setActiveProvider(provider);
      setWalletName(name || "Wallet");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Legacy connect — uses window.ethereum directly
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No wallet detected. Open this page in a wallet app or install MetaMask.");
      return;
    }
    return connectWithProvider(window.ethereum,
      window.ethereum.isMetaMask ? "MetaMask"
        : window.ethereum.isPhantom ? "Phantom"
        : window.ethereum.isCoinbaseWallet ? "Coinbase Wallet"
        : "Wallet"
    );
  }, [connectWithProvider]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setConnected(false);
    setActiveProvider(null);
    setWalletName(null);
  }, []);

  // Auto-hydrate on mount (silent — no popup)
  useEffect(() => {
    const provider = activeProvider || window.ethereum;
    if (!provider) return;
    let cancelled = false;

    const hydrate = async () => {
      try {
        const accounts = await provider.request({ method: "eth_accounts" });
        if (cancelled) return;
        if (accounts && accounts.length > 0) {
          const ethersProvider = new ethers.BrowserProvider(provider);
          const network = await ethersProvider.getNetwork();
          if (cancelled) return;
          setAddress(accounts[0]);
          setChainId(Number(network.chainId));
          setConnected(true);
          if (!activeProvider) setActiveProvider(provider);
        } else {
          setAddress(null);
          setConnected(false);
        }
      } catch (err) {
        console.warn("[useWallet] hydrate failed:", err.message);
      }
    };

    hydrate();
    const onFocus = () => hydrate();
    const onVisibility = () => { if (document.visibilityState === "visible") hydrate(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeProvider]);

  // Listen for account/chain changes
  useEffect(() => {
    const provider = activeProvider || window.ethereum;
    if (!provider) return;
    const onAccounts = (accounts) => {
      if (accounts.length === 0) disconnect();
      else { setAddress(accounts[0]); setConnected(true); }
    };
    const onChain = (id) => setChainId(parseInt(id, 16));
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener("accountsChanged", onAccounts);
      provider.removeListener("chainChanged", onChain);
    };
  }, [activeProvider, disconnect]);

  // Signer wrapper (backward compatible)
  const signer = connected && (activeProvider || window.ethereum)
    ? {
      getAddress: async () => {
        const p = new ethers.BrowserProvider(activeProvider || window.ethereum);
        const s = await p.getSigner();
        return s.getAddress();
      },
      signMessage: async (message) => {
        const p = new ethers.BrowserProvider(activeProvider || window.ethereum);
        const s = await p.getSigner();
        return s.signMessage(message);
      },
    }
    : null;

  const switchChain = useCallback(async () => {
    const provider = activeProvider || window.ethereum;
    if (!provider) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
      });
    } catch (err) {
      // Chain not added — try adding Base
      if (err.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
            chainName: "Base",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          }],
        });
      }
    }
  }, [activeProvider]);

  return {
    address,
    chainId,
    connected,
    isConnected: connected,
    signer,
    loading,
    error,
    walletName,
    connect,
    connectWithProvider,
    disconnect,
    switchChain,
  };
}

// ─────────────────────────────────────────────────────────────
// useSubscribe — Base Alpha (unchanged)
// ─────────────────────────────────────────────────────────────
export function useSubscribe() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const subscribe = useCallback(async () => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer = await getSigner();
      await ensureBaseChain(signer);
      const contract = new ethers.Contract(CONTRACTS.BaseAlphaSubscription, ABI_BASE_ALPHA, signer);
      const price = await contract.SUBSCRIPTION_PRICE();
      const tx = await contract.subscribe({ value: price });
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }, []);

  const checkSubscription = useCallback(async (address) => {
    if (!address) return null;
    try {
      const contract = new ethers.Contract(CONTRACTS.BaseAlphaSubscription, ABI_BASE_ALPHA, getReadProvider());
      const [isActive, expiry] = await Promise.all([
        contract.isSubscribed(address),
        contract.subscriptionExpiry(address),
      ]);
      return { isActive, expiry: Number(expiry), expiryDate: new Date(Number(expiry) * 1000) };
    } catch (err) { console.error("checkSubscription error:", err); return null; }
  }, []);

  return { subscribe, checkSubscription, loading, error, txHash };
}

// ─────────────────────────────────────────────────────────────
// useVaultDeposit — YieldPilot (unchanged)
// ─────────────────────────────────────────────────────────────
export function useVaultDeposit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const deposit = useCallback(async (usdcAmount) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer = await getSigner();
      await ensureBaseChain(signer);
      const address = await signer.getAddress();
      const amount = ethers.parseUnits(usdcAmount.toString(), 6);
      const vault = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, signer);
      const usdc = new ethers.Contract(USDC_BASE, ABI_USDC, signer);
      const currentAllowance = await usdc.allowance(address, CONTRACTS.YieldPilotVault);
      if (currentAllowance < amount) {
        const approveTx = await usdc.approve(CONTRACTS.YieldPilotVault, amount);
        await approveTx.wait();
      }
      const tx = await vault.deposit(amount);
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }, []);

  const withdraw = useCallback(async (sharesAmount) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer = await getSigner();
      await ensureBaseChain(signer);
      const shares = ethers.parseUnits(sharesAmount.toString(), 6);
      const vault = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, signer);
      const tx = await vault.withdraw(shares);
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }, []);

  const getPosition = useCallback(async (address) => {
    if (!address) return null;
    try {
      const vault = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, getReadProvider());
      const [currentValue, costBasis, pnl] = await vault.getPositionValue(address);
      const [, shares] = await vault.positions(address);
      return {
        shares: ethers.formatUnits(shares, 6),
        currentValue: ethers.formatUnits(currentValue, 6),
        costBasis: ethers.formatUnits(costBasis, 6),
        pnl: ethers.formatUnits(pnl, 6),
      };
    } catch (err) { console.error("getPosition error:", err); return null; }
  }, []);

  return { deposit, withdraw, getPosition, loading, error, txHash };
}

// ─────────────────────────────────────────────────────────────
// useAgentDeploy — AgentForge (unchanged)
// ─────────────────────────────────────────────────────────────
export const AGENT_FORGE_TIERS = { Starter: 1, Pro: 2, Enterprise: 3 };

export function useAgentDeploy() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const subscribeAgentForge = useCallback(async (tier) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer = await getSigner();
      await ensureBaseChain(signer);
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, signer);
      const priceMap = {
        [AGENT_FORGE_TIERS.Starter]: await contract.priceStarter(),
        [AGENT_FORGE_TIERS.Pro]: await contract.pricePro(),
        [AGENT_FORGE_TIERS.Enterprise]: await contract.priceEnterprise(),
      };
      const tx = await contract.subscribe(tier, { value: priceMap[tier] });
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }, []);

  const registerAgent = useCallback(async (metadataURI) => {
    setLoading(true); setError(null);
    try {
      const signer = await getSigner();
      await ensureBaseChain(signer);
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, signer);
      const tx = await contract.registerAgent(metadataURI);
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      const event = receipt.logs
        .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "AgentRegistered");
      return { txHash: tx.hash, agentId: event?.args?.agentId || null };
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }, []);

  const getAgentForgeStatus = useCallback(async (address) => {
    if (!address) return null;
    try {
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, getReadProvider());
      const [isActive, sub, agentIds] = await Promise.all([
        contract.isActive(address),
        contract.getSubscription(address),
        contract.getOwnerAgents(address),
      ]);
      const tierNames = ["None", "Starter", "Pro", "Enterprise"];
      return { isActive, tier: tierNames[sub.tier], expiry: Number(sub.expiry), agentSlots: Number(sub.agentSlots), agentCount: agentIds.length, agentIds };
    } catch (err) { console.error("getAgentForgeStatus error:", err); return null; }
  }, []);

  return { subscribeAgentForge, registerAgent, getAgentForgeStatus, loading, error, txHash };
}

// ─────────────────────────────────────────────────────────────
// ConnectButton — Mobile-first with wallet picker
// ─────────────────────────────────────────────────────────────

const MODAL_OVERLAY = {
  position: "fixed", inset: 0, zIndex: 9999,
  background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
  display: "flex", alignItems: "flex-end", justifyContent: "center",
  padding: "0 0 env(safe-area-inset-bottom, 0px) 0",
  animation: "fadeIn 0.2s ease",
};

const MODAL_SHEET = {
  width: "100%", maxWidth: 420,
  background: "#0a0a14", border: "1px solid #1a1a2e",
  borderRadius: "20px 20px 0 0", padding: "24px 20px 32px",
  maxHeight: "70vh", overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

const WALLET_ROW = {
  display: "flex", alignItems: "center", gap: 14,
  padding: "14px 16px", borderRadius: 12,
  border: "1px solid #1a1a2e", background: "rgba(255,255,255,0.02)",
  cursor: "pointer", width: "100%", textAlign: "left",
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 13, color: "#dcdce5", letterSpacing: "0.02em",
  transition: "all 0.15s ease",
};

export function ConnectButton({ onConnect, onDisconnect, className = "" }) {
  const { address, chainId, connected, loading, error, connect, connectWithProvider, disconnect, switchChain } = useWallet();
  const discoveredWallets = useDiscoveredWallets();
  const [showPicker, setShowPicker] = useState(false);
  const isWrongChain = connected && chainId !== BASE_CHAIN_ID;
  const mobile = isMobile();
  const inApp = isInAppBrowser();

  useEffect(() => {
    if (connected && address) onConnect?.(address);
  }, [connected, address, onConnect]);

  const handleConnect = () => {
    if (inApp || (!mobile && discoveredWallets.length <= 1)) {
      // In-app browser or single wallet on desktop — connect directly
      connect();
    } else {
      // Show picker
      setShowPicker(true);
    }
  };

  const handleSelectWallet = async (wallet) => {
    setShowPicker(false);
    await connectWithProvider(wallet.provider, wallet.info.name);
  };

  const handleDisconnect = () => {
    disconnect();
    onDisconnect?.();
  };

  // Button states
  if (loading) return (
    <button disabled className={className} style={btnStyle("#1a1a2e", "#6a6a82")}>
      Connecting...
    </button>
  );
  if (isWrongChain) return (
    <button onClick={switchChain} className={className} style={btnStyle("#2a1a1a", "#ff6b6b")}>
      Switch to Base
    </button>
  );
  if (connected) return (
    <button onClick={handleDisconnect} className={className} style={btnStyle("#0a1a1a", "#00ffee")}>
      {address.slice(0, 6)}...{address.slice(-4)}
    </button>
  );

  return (
    <>
      <div className={className}>
        <button onClick={handleConnect} style={btnStyle("#0a0a14", "#00ffee")}>
          Connect Wallet
        </button>
        {error && <p style={{ color: "#ff6b6b", fontSize: 10, marginTop: 6, fontFamily: "monospace" }}>{error}</p>}
      </div>

      {/* Wallet Picker Modal */}
      {showPicker && (
        <div style={MODAL_OVERLAY} onClick={() => setShowPicker(false)}>
          <div style={MODAL_SHEET} onClick={e => e.stopPropagation()}>
            {/* Handle bar */}
            <div style={{ width: 36, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 20px" }} />

            <div style={{ fontSize: 14, fontWeight: 700, color: "#dcdce5", fontFamily: '"JetBrains Mono", monospace', letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 20 }}>
              Connect Wallet
            </div>

            {/* Discovered wallets (EIP-6963 + legacy) */}
            {discoveredWallets.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {discoveredWallets.map(w => (
                  <button
                    key={w.info.rdns}
                    onClick={() => handleSelectWallet(w)}
                    style={WALLET_ROW}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,255,238,0.05)"; e.currentTarget.style.borderColor = "#00ffee"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "#1a1a2e"; }}
                  >
                    {w.info.icon ? (
                      <img src={w.info.icon} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◆</div>
                    )}
                    <span>{w.info.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mobile deeplinks */}
            {mobile && !inApp && (
              <>
                <div style={{ fontSize: 10, color: "#6a6a82", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 10, fontFamily: "monospace" }}>
                  Open in wallet app
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {getWalletDeeplinks().map(dl => (
                    <a
                      key={dl.name}
                      href={dl.url}
                      style={{ ...WALLET_ROW, textDecoration: "none" }}
                    >
                      <span style={{ fontSize: 20 }}>{dl.icon}</span>
                      <span>{dl.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#6a6a82" }}>→</span>
                    </a>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={() => setShowPicker(false)}
              style={{ width: "100%", marginTop: 16, padding: 12, background: "transparent", border: "1px solid #333", borderRadius: 12, color: "#6a6a82", fontSize: 12, fontFamily: "monospace", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function btnStyle(bg, color) {
  return {
    background: bg, color, border: `1px solid ${color}33`,
    padding: "10px 20px", borderRadius: 10, cursor: "pointer",
    fontFamily: '"JetBrains Mono", monospace', fontSize: 12,
    fontWeight: 700, letterSpacing: "0.08em",
    minHeight: 44, // touch target
    WebkitTapHighlightColor: "transparent",
  };
}
