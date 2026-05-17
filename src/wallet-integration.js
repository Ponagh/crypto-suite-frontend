/**
 * wallet-integration.js — React Hooks + ConnectButton
 * Sovereign Crypto Suite
 *
 * ── Contract Addresses (Base Mainnet) — ALL LIVE ───────────────
 *   BaseAlphaSubscription : 0xbB0740BDcB1927bdDC37f07f8a9B3291d35e1139
 *   YieldPilotVault (V2)  : 0x671025e627244D92FdF13A30A2Ad42fDfedeD0f6
 *   AgentForgeRegistry    : 0xa67421E8d9119247708c4474BE3Dc76567fC618f
 *
 * ── ARCHITECTURE ───────────────────────────────────────────────
 *   Wallet state is shared across the entire app via React Context.
 *   Wrap your tree with <WalletProvider> (done in App.js). Every
 *   call to useWallet() reads the SAME state. Prior versions of this
 *   file called useState() inside useWallet itself, which meant every
 *   component got its own independent state — only the ConnectButton's
 *   state ever updated when the user clicked Connect, so the rest of
 *   the app stayed permanently disconnected.
 *
 *   On mount, the provider probes window.ethereum via eth_accounts so
 *   page refreshes don't drop the connection (fixes Phantom dropout).
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────
// CONTRACT ADDRESSES — all confirmed live on Base mainnet
// ─────────────────────────────────────────────────────────────
export const CONTRACTS = {
  BaseAlphaSubscription: "0xbB0740BDcB1927bdDC37f07f8a9B3291d35e1139",
  YieldPilotVault:       "0x671025e627244D92FdF13A30A2Ad42fDfedeD0f6", // V2 UUPS proxy
  AgentForgeRegistry:    "0xa67421E8d9119247708c4474BE3Dc76567fC618f",
};

// USDC on Base mainnet (the asset YieldPilot vault holds)
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

export const BASE_CHAIN_ID = 8453;

// ─────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────
const ABI_ERC20 = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ABI_BASE_ALPHA = [
  "function subscribe() external payable",
  "function isSubscribed(address user) view returns (bool)",
  "function subscriptionExpiry(address user) view returns (uint256)",
  "function SUBSCRIPTION_PRICE() view returns (uint256)",
];

const ABI_YIELD_PILOT = [
  "function deposit(uint256 assets, address receiver) returns (uint256 shares)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)",
  "function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function convertToShares(uint256 assets) view returns (uint256)",
  "function balanceOf(address user) view returns (uint256)",
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
async function ensureBaseChain(provider) {
  const network = await provider.getNetwork();
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
// WalletContext + Provider — SINGLE SOURCE OF TRUTH
// ─────────────────────────────────────────────────────────────
const WalletContext = createContext(null);

const DISCONNECTED = Object.freeze({ address: null, chainId: null, connected: false });

export function WalletProvider({ children }) {
  const [address,   setAddress]   = useState(null);
  const [chainId,   setChainId]   = useState(null);
  const [connected, setConnected] = useState(false);
  const [signer,    setSigner]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  // Manual-disconnect latch — once user clicks Disconnect, don't auto-reconnect
  // via eth_accounts on the next render until they explicitly Connect again.
  const manualDisconnectRef = useRef(false);

  const applyAccounts = useCallback(async (accounts) => {
    if (!accounts || accounts.length === 0) {
      setAddress(null);
      setConnected(false);
      setSigner(null);
      return;
    }
    setAddress(accounts[0]);
    setConnected(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      setChainId(Number(network.chainId));
      const s = await provider.getSigner();
      setSigner(s);
    } catch (e) {
      console.warn("[wallet] applyAccounts:", e?.message);
    }
  }, []);

  // ── Auto-restore on mount (fixes Phantom-disconnect-on-refresh) ────────
  useEffect(() => {
    if (!window.ethereum) return;
    let cancelled = false;
    (async () => {
      try {
        // eth_accounts returns CURRENTLY authorized accounts WITHOUT prompting
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (cancelled || manualDisconnectRef.current) return;
        if (accounts && accounts.length > 0) {
          await applyAccounts(accounts);
        }
      } catch (e) {
        console.warn("[wallet] eth_accounts probe failed:", e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [applyAccounts]);

  // ── Provider event listeners ───────────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts) => {
      if (!accounts || accounts.length === 0) {
        setAddress(null); setConnected(false); setSigner(null);
      } else {
        applyAccounts(accounts);
      }
    };
    const onChain = (id) => setChainId(parseInt(id, 16));
    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged",    onChain);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged",    onChain);
    };
  }, [applyAccounts]);

  const connect = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet detected.");
      manualDisconnectRef.current = false;
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      await applyAccounts(accounts);
    } catch (err) {
      setError(err?.message || "connect failed");
    } finally {
      setLoading(false);
    }
  }, [applyAccounts]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    setAddress(null); setChainId(null); setConnected(false); setSigner(null);
  }, []);

  const value = {
    ...(connected ? { address, chainId, connected: true } : DISCONNECTED),
    isConnected: connected,
    signer,
    loading,
    error,
    connect,
    disconnect,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

// ─────────────────────────────────────────────────────────────
// useWallet — reads shared context
// ─────────────────────────────────────────────────────────────
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    // Defensive fallback — should never hit if <WalletProvider> wraps the app.
    return {
      ...DISCONNECTED,
      isConnected: false,
      signer: null,
      loading: false,
      error: null,
      connect: () => console.warn("[wallet] useWallet called outside WalletProvider"),
      disconnect: () => {},
    };
  }
  return ctx;
}

// ─────────────────────────────────────────────────────────────
// useSubscribe — Base Alpha
// ─────────────────────────────────────────────────────────────
export function useSubscribe() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  const subscribe = useCallback(async () => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      if (!signer) throw new Error("Connect wallet first.");
      await ensureBaseChain(signer.provider);
      const contract = new ethers.Contract(CONTRACTS.BaseAlphaSubscription, ABI_BASE_ALPHA, signer);
      const price    = await contract.SUBSCRIPTION_PRICE();
      const tx       = await contract.subscribe({ value: price });
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) { setError(err?.message || "subscribe failed"); throw err; }
    finally { setLoading(false); }
  }, [signer]);

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
// useVaultDeposit — YieldPilot (ERC4626 vault on Base)
//
// Deposit flow is TWO transactions:
//   1. USDC.approve(vault, amount)   — if current allowance is insufficient
//   2. vault.deposit(assets, receiver)
//
// We use an "infinite" approval (MaxUint256) so the user only signs the
// approve once per wallet — same pattern used by Uniswap, Aave, and our
// own agent-runner.ensureAgentAllowance. Subsequent deposits skip step 1.
//
// Withdraw uses ERC4626 redeem(shares, receiver, owner) since the modal
// asks the user for SHARES, not asset amount.
//
// Both functions accept an optional { onStep } callback so the UI can
// show "Approving..." vs "Depositing..." instead of one generic spinner.
// ─────────────────────────────────────────────────────────────
export function useVaultDeposit() {
  const { signer, address } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  const deposit = useCallback(async (usdcAmount, { onStep } = {}) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      if (!signer || !address) throw new Error("Connect wallet first.");
      await ensureBaseChain(signer.provider);

      const assets = ethers.parseUnits(usdcAmount.toString(), 6);

      // ── Step 1: ensure USDC allowance ───────────────────────
      const usdc = new ethers.Contract(USDC_BASE, ABI_ERC20, signer);
      const currentAllowance = await usdc.allowance(address, CONTRACTS.YieldPilotVault);

      if (currentAllowance < assets) {
        onStep?.("approving");
        const approveTx = await usdc.approve(CONTRACTS.YieldPilotVault, ethers.MaxUint256);
        await approveTx.wait();
      }

      // ── Step 2: deposit ────────────────────────────────────
      onStep?.("depositing");
      const vault = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, signer);
      const tx    = await vault.deposit(assets, address);
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      setError(err?.shortMessage || err?.message || "deposit failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, address]);

  const withdraw = useCallback(async (sharesAmount, { onStep } = {}) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      if (!signer || !address) throw new Error("Connect wallet first.");
      await ensureBaseChain(signer.provider);

      // Vault shares mirror USDC's 6 decimals
      const shares = ethers.parseUnits(sharesAmount.toString(), 6);

      onStep?.("withdrawing");
      const vault = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, signer);
      // redeem(shares, receiver, owner) — caller is owner, redeems to themselves
      const tx = await vault.redeem(shares, address, address);
      setTxHash(tx.hash);
      await tx.wait();
      return tx.hash;
    } catch (err) {
      setError(err?.shortMessage || err?.message || "withdraw failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [signer, address]);

  const getPosition = useCallback(async (addr) => {
    if (!addr) return null;
    try {
      const contract = new ethers.Contract(CONTRACTS.YieldPilotVault, ABI_YIELD_PILOT, getReadProvider());
      const shares   = await contract.balanceOf(addr);
      const assets   = shares > 0n ? await contract.convertToAssets(shares) : 0n;
      return { shares: ethers.formatUnits(shares, 6), assets: ethers.formatUnits(assets, 6) };
    } catch (err) { console.error("getPosition error:", err); return null; }
  }, []);

  const getUsdcAllowance = useCallback(async (addr) => {
    if (!addr) return 0n;
    try {
      const usdc = new ethers.Contract(USDC_BASE, ABI_ERC20, getReadProvider());
      return await usdc.allowance(addr, CONTRACTS.YieldPilotVault);
    } catch (err) { console.error("getUsdcAllowance error:", err); return 0n; }
  }, []);

  return { deposit, withdraw, getPosition, getUsdcAllowance, loading, error, txHash };
}

// ─────────────────────────────────────────────────────────────
// useAgentDeploy — AgentForge
// ─────────────────────────────────────────────────────────────
export const AGENT_FORGE_TIERS = { Starter: 1, Pro: 2, Enterprise: 3 };

export function useAgentDeploy() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  const subscribeAgentForge = useCallback(async (tier) => {
    setLoading(true); setError(null); setTxHash(null);
    try {
      if (!signer) throw new Error("Connect wallet first.");
      await ensureBaseChain(signer.provider);
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
    } catch (err) { setError(err?.message || "subscribe failed"); throw err; }
    finally { setLoading(false); }
  }, [signer]);

  const registerAgent = useCallback(async (metadataURI) => {
    setLoading(true); setError(null);
    try {
      if (!signer) throw new Error("Connect wallet first.");
      await ensureBaseChain(signer.provider);
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, signer);
      const tx       = await contract.registerAgent(metadataURI);
      setTxHash(tx.hash);
      const receipt  = await tx.wait();
      const event    = receipt.logs
        .map(log => { try { return contract.interface.parseLog(log); } catch { return null; } })
        .find(e => e?.name === "AgentRegistered");
      return { txHash: tx.hash, agentId: event?.args?.agentId || null };
    } catch (err) { setError(err?.message || "register failed"); throw err; }
    finally { setLoading(false); }
  }, [signer]);

  const getAgentForgeStatus = useCallback(async (addr) => {
    if (!addr) return null;
    try {
      const contract = new ethers.Contract(CONTRACTS.AgentForgeRegistry, ABI_AGENT_FORGE, getReadProvider());
      const [isActive, sub, agentIds] = await Promise.all([
        contract.isActive(addr),
        contract.getSubscription(addr),
        contract.getOwnerAgents(addr),
      ]);
      const tierNames = ["None", "Starter", "Pro", "Enterprise"];
      return { isActive, tier: tierNames[sub.tier], expiry: Number(sub.expiry), agentSlots: Number(sub.agentSlots), agentCount: agentIds.length, agentIds };
    } catch (err) { console.error("getAgentForgeStatus error:", err); return null; }
  }, []);

  return { subscribeAgentForge, registerAgent, getAgentForgeStatus, loading, error, txHash };
}

// ─────────────────────────────────────────────────────────────
// ConnectButton — consumes shared context
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
  if (connected)    return (
    <button
      onClick={() => { disconnect(); onDisconnect?.(); }}
      className={`connect-btn connect-btn--connected ${className}`}
      title="Click to disconnect"
    >
      <span className="connect-btn__dot" />
      {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );

  return (
    <div className={`connect-btn-wrapper ${className}`}>
      <button onClick={connect} className="connect-btn">Connect Wallet</button>
      {error && <p className="connect-btn__error">{error}</p>}
    </div>
  );
}
