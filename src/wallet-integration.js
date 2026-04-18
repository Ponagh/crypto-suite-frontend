/**
 * wallet-integration.js — React Hooks + ConnectButton
 * Sovereign Crypto Suite
 *
 * ── Contract Addresses (Base Mainnet) — ALL LIVE ───────────────
 *   BaseAlphaSubscription : 0xbB0740BDcB1927bdDC37f07f8a9B3291d35e1139
 *   YieldPilotVault       : 0x8d0420fe81C3499D414ac3dEB2f37E8F5297df9F
 *   AgentForgeRegistry    : 0xa67421E8d9119247708c4474BE3Dc76567fC618f
 */

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────
// CONTRACT ADDRESSES — all confirmed live on Base mainnet
// ─────────────────────────────────────────────────────────────
export const CONTRACTS = {
  BaseAlphaSubscription: "0xbB0740BDcB1927bdDC37f07f8a9B3291d35e1139",
  YieldPilotVault:       "0x8d0420fe81C3499D414ac3dEB2f37E8F5297df9F",
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
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function balanceOf(address user) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function totalAssets() view returns (uint256)",
];

const ABI_AGENT_FORGE = [
  "function subscribe(uint8 tier) external payable",
  "function registerAgent(string metadataURI) external returns (bytes32)",
  "function deactivateAgent(bytes32 agentId) external",
  "function isActive(address user) view returns (bool)",
  "function getSubscription(address user) view returns (tuple(uint8 tier, uint256 expiry, uint256 agentSlots))",
  "function getOwnerAgents(address owner) view returns (bytes32[])",
  "function priceStarter() view returns (uint256)",
  "function pricePro() view returns (uint256)",
  "function priceEnterprise() view returns (uint256)",
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
async function getSigner() {
  if (!window.ethereum) throw new Error("No wallet detected. Install Coinbase Wallet.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

async function ensureBaseChain(signer) {
  const network = await signer.provider.getNetwork();
  if (Number(network.chainId) !== BASE_CHAIN_ID) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
    });
  }
}

function getReadProvider() {
  return new ethers.JsonRpcProvider(
    process.env.REACT_APP_BASE_RPC_URL || "https://mainnet.base.org"
  );
}

// ─────────────────────────────────────────────────────────────
// useWallet
// ─────────────────────────────────────────────────────────────
export function useWallet() {
  const [address,   setAddress]   = useState(null);
  const [chainId,   setChainId]   = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  const connect = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet detected.");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network  = await provider.getNetwork();
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
      setConnected(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null); setChainId(null); setConnected(false);
  }, []);

  // Auto-hydrate wallet state on mount — detects already-connected wallets
  // without prompting the user. Uses eth_accounts (silent) not eth_requestAccounts.
  // Also re-runs on window focus / visibility change, which handles Brave losing
  // provider context after signMessage popups close.
  useEffect(() => {
    if (!window.ethereum) return;
    let cancelled = false;

    const hydrate = async () => {
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (cancelled) return;
        if (accounts && accounts.length > 0) {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const network  = await provider.getNetwork();
          if (cancelled) return;
          setAddress(accounts[0]);
          setChainId(Number(network.chainId));
          setConnected(true);
        } else {
          // Wallet actually disconnected — clear state
          setAddress(null);
          setConnected(false);
        }
      } catch (err) {
        console.warn("[useWallet] hydrate failed:", err.message);
      }
    };

    hydrate();

    const onFocus = () => hydrate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") hydrate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts) => {
      if (accounts.length === 0) disconnect();
      else { setAddress(accounts[0]); setConnected(true); }
    };
    const onChain    = (id) => setChainId(parseInt(id, 16));
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged",    onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged",    onChain);
    };
  }, [disconnect]);

  // Lazy signer getter — agent-forge.jsx uses `signer.signMessage()` for EIP-191.
  // We expose a thin wrapper that provides getAddress() and signMessage() on demand,
  // resolving the actual ethers.Signer only when called (async under the hood).
  const signer = connected && window.ethereum
    ? {
        getAddress: async () => {
          const p = new ethers.BrowserProvider(window.ethereum);
          const s = await p.getSigner();
          return s.getAddress();
        },
        signMessage: async (message) => {
          const p = new ethers.BrowserProvider(window.ethereum);
          const s = await p.getSigner();
          return s.signMessage(message);
        },
      }
    : null;

  // Expose both `connected` (original) and `isConnected` (what agent-forge.jsx expects)
  return {
    address,
    chainId,
    connected,
    isConnected: connected,
    signer,
    loading,
    error,
    connect,
    disconnect,
  };
}

// ─────────────────────────────────────────────────────────────
// useSubscribe — Base Alpha
// ─────────────────────────────────────────────────────────────
export function useSubscribe() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  const subscribe = useCallback(async () => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer   = await getSigner();
      await ensureBaseChain(signer);
      const contract = new ethers.Contract(CONTRACTS.BaseAlphaSubscription, ABI_BASE_ALPHA, signer);
      const price    = await contract.SUBSCRIPTION_PRICE();
      const tx       = await contract.subscribe({ value: price });
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
// useVaultDeposit — YieldPilot
// ─────────────────────────────────────────────────────────────
export function useVaultDeposit() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  const deposit = useCallback(async (usdcAmount) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer   = await getSigner();
      await ensureBaseChain(signer);
      const address  = await signer.getAddress();
      const assets   = ethers.parseUnits(usdcAmount.toString(), 6);
      const contract = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, signer);
      const tx       = await contract.deposit(assets, address);
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) { setError(err.message); throw err; }
    finally { setLoading(false); }
  }, []);

  const getPosition = useCallback(async (address) => {
    if (!address) return null;
    try {
      const contract = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, getReadProvider());
      const shares   = await contract.balanceOf(address);
      const assets   = shares > 0n ? await contract.convertToAssets(shares) : 0n;
      return { shares: ethers.formatUnits(shares, 6), assets: ethers.formatUnits(assets, 6) };
    } catch (err) { console.error("getPosition error:", err); return null; }
  }, []);

  return { deposit, getPosition, loading, error, txHash };
}

// ─────────────────────────────────────────────────────────────
// useAgentDeploy — AgentForge
// ─────────────────────────────────────────────────────────────
export const AGENT_FORGE_TIERS = { Starter: 1, Pro: 2, Enterprise: 3 };

export function useAgentDeploy() {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  const subscribeAgentForge = useCallback(async (tier) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      const signer   = await getSigner();
      await ensureBaseChain(signer);
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, signer);
      const priceMap = {
        [AGENT_FORGE_TIERS.Starter]:    await contract.priceStarter(),
        [AGENT_FORGE_TIERS.Pro]:        await contract.pricePro(),
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
      const signer   = await getSigner();
      await ensureBaseChain(signer);
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, signer);
      const tx       = await contract.registerAgent(metadataURI);
      setTxHash(tx.hash);
      const receipt  = await tx.wait();
      const event    = receipt.logs
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
// ConnectButton
// ─────────────────────────────────────────────────────────────
export function ConnectButton({ onConnect, onDisconnect, className = "" }) {
  const { address, chainId, connected, loading, error, connect, disconnect } = useWallet();
  const isWrongChain = connected && chainId !== BASE_CHAIN_ID;

  useEffect(() => { if (connected && address) onConnect?.(address); }, [connected, address, onConnect]);

  const switchChain = () => window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
  });

  if (loading)      return <button disabled className={`connect-btn connect-btn--loading ${className}`}>Connecting...</button>;
  if (isWrongChain) return <button onClick={switchChain} className={`connect-btn connect-btn--wrong-chain ${className}`}>Switch to Base</button>;
  if (connected)    return <button onClick={() => { disconnect(); onDisconnect?.(); }} className={`connect-btn connect-btn--connected ${className}`}>{address.slice(0,6)}...{address.slice(-4)}</button>;

  return (
    <div className={`connect-btn-wrapper ${className}`}>
      <button onClick={connect} className="connect-btn">Connect Wallet</button>
      {error && <p className="connect-btn__error">{error}</p>}
    </div>
  );
}
