/**
 * ═══════════════════════════════════════════════════════════════
 *  COINBASE ONCHAINKIT WALLET INTEGRATION
 *  Complete React setup for all three apps
 * ═══════════════════════════════════════════════════════════════
 *
 *  INSTALL:
 *    npm install @coinbase/onchainkit wagmi viem @tanstack/react-query ethers
 *
 *  This file provides:
 *  1. WalletProvider — wraps your entire app
 *  2. useSubscribe — hook for Base Alpha Pro subscriptions
 *  3. useVaultDeposit — hook for YieldPilot deposits
 *  4. useAgentDeploy — hook for AgentForge agent registration
 *  5. ConnectButton — styled wallet connect component
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { ethers } from 'ethers';

// ═══════════════════════════════════════════════════════════════
// CONFIG — Update these after deploying contracts
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  chainId: 8453,  // Base Mainnet
  chainName: 'Base',
  rpcUrl: 'https://mainnet.base.org',
  explorer: 'https://basescan.org',

  contracts: {
    baseAlpha:  process.env.REACT_APP_BASE_ALPHA_CONTRACT  || '0x_YOUR_CONTRACT',
    yieldPilot: process.env.REACT_APP_YIELD_PILOT_CONTRACT || '0x_YOUR_CONTRACT',
    agentForge: process.env.REACT_APP_AGENT_FORGE_CONTRACT || '0x_YOUR_CONTRACT',
    usdc:       '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },

  // Subscription prices in ETH (update to match your contract)
  prices: {
    alphaMonthly:    '0.00285',    // ~$9.99
    forgeProMonthly: '0.00828',    // ~$29
    forgeWhaleMonthly: '0.02828',  // ~$99
  },
};

// ═══════════════════════════════════════════════════════════════
// ABIs (minimal — only the functions we call from frontend)
// ═══════════════════════════════════════════════════════════════

const BASE_ALPHA_ABI = [
  'function subscribe(uint256 months) payable',
  'function isActive(address user) view returns (bool)',
  'function getExpiry(address user) view returns (uint256)',
  'function monthlyPriceWei() view returns (uint256)',
];

const YIELD_PILOT_ABI = [
  'function deposit(uint256 amount)',
  'function withdraw(uint256 shares)',
  'function getPositionValue(address user) view returns (uint256, uint256, int256)',
  'function sharePrice() view returns (uint256)',
  'function positions(address) view returns (uint256 deposited, uint256 shares, uint256 depositTimestamp)',
];

const AGENT_FORGE_ABI = [
  'function subscribe(uint8 tier, uint256 months) payable',
  'function deployAgent(string templateId, string name, address agentWallet)',
  'function toggleAgent(uint256 index)',
  'function getSubscription(address) view returns (uint8, uint256, uint256, uint256)',
  'function getUserAgents(address) view returns (tuple(uint256 id, address owner, string templateId, string name, address agentWallet, uint256 budget, bool active, uint256 createdAt)[])',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
];

// ═══════════════════════════════════════════════════════════════
// WALLET CONTEXT
// ═══════════════════════════════════════════════════════════════

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // Check for injected provider (Coinbase Wallet, MetaMask, etc.)
      if (!window.ethereum) {
        throw new Error('No wallet found. Install Coinbase Wallet from coinbase.com/wallet');
      }

      const ethProvider = new ethers.BrowserProvider(window.ethereum);

      // Request account access
      const accounts = await ethProvider.send('eth_requestAccounts', []);
      const ethSigner = await ethProvider.getSigner();
      const network = await ethProvider.getNetwork();

      // Switch to Base if not already
      if (Number(network.chainId) !== CONFIG.chainId) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${CONFIG.chainId.toString(16)}` }],
          });
        } catch (switchError) {
          // Chain not added — add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${CONFIG.chainId.toString(16)}`,
                chainName: CONFIG.chainName,
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [CONFIG.rpcUrl],
                blockExplorerUrls: [CONFIG.explorer],
              }],
            });
          } else {
            throw switchError;
          }
        }
      }

      setAddress(accounts[0]);
      setSigner(ethSigner);
      setProvider(ethProvider);
      setChainId(CONFIG.chainId);

      // Listen for account/chain changes
      window.ethereum.on('accountsChanged', (accts) => {
        if (accts.length === 0) disconnect();
        else setAddress(accts[0]);
      });

      window.ethereum.on('chainChanged', () => window.location.reload());

    } catch (err) {
      setError(err.message);
      console.error('[Wallet] Connection error:', err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
  }, []);

  return (
    <WalletContext.Provider value={{
      address, signer, provider, chainId,
      isConnecting, error, connect, disconnect,
      isConnected: !!address,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be inside WalletProvider');
  return ctx;
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useSubscribe — Base Alpha Pro subscription
// ═══════════════════════════════════════════════════════════════

export function useSubscribe() {
  const { signer, address } = useWallet();
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);

  const subscribeToPro = useCallback(async (months = 1) => {
    if (!signer) throw new Error('Connect wallet first');
    setLoading(true);

    try {
      const contract = new ethers.Contract(CONFIG.contracts.baseAlpha, BASE_ALPHA_ABI, signer);

      // Get current price from contract
      const monthlyPrice = await contract.monthlyPriceWei();
      const totalPrice = monthlyPrice * BigInt(months);

      // Send subscription tx
      const tx = await contract.subscribe(months, { value: totalPrice });
      setTxHash(tx.hash);

      const receipt = await tx.wait();
      return { success: true, hash: tx.hash, receipt };
    } catch (err) {
      console.error('[Subscribe] Error:', err);
      return { success: false, error: err.reason || err.message };
    } finally {
      setLoading(false);
    }
  }, [signer]);

  const checkSubscription = useCallback(async () => {
    if (!signer || !address) return null;
    const contract = new ethers.Contract(CONFIG.contracts.baseAlpha, BASE_ALPHA_ABI, signer);
    const isActive = await contract.isActive(address);
    const expiry = await contract.getExpiry(address);
    return { isActive, expiry: Number(expiry) };
  }, [signer, address]);

  return { subscribeToPro, checkSubscription, loading, txHash };
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useVaultDeposit — YieldPilot deposit/withdraw
// ═══════════════════════════════════════════════════════════════

export function useVaultDeposit() {
  const { signer, address } = useWallet();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(''); // 'approving', 'depositing', 'done'

  const deposit = useCallback(async (amountUsdc) => {
    if (!signer) throw new Error('Connect wallet first');
    setLoading(true);

    try {
      // USDC has 6 decimals
      const amount = ethers.parseUnits(amountUsdc.toString(), 6);

      // Step 1: Check allowance
      setStep('approving');
      const usdc = new ethers.Contract(CONFIG.contracts.usdc, ERC20_ABI, signer);
      const currentAllowance = await usdc.allowance(address, CONFIG.contracts.yieldPilot);

      if (currentAllowance < amount) {
        const approveTx = await usdc.approve(CONFIG.contracts.yieldPilot, amount);
        await approveTx.wait();
      }

      // Step 2: Deposit
      setStep('depositing');
      const vault = new ethers.Contract(CONFIG.contracts.yieldPilot, YIELD_PILOT_ABI, signer);
      const tx = await vault.deposit(amount);
      const receipt = await tx.wait();

      setStep('done');
      return { success: true, hash: tx.hash, receipt };
    } catch (err) {
      console.error('[Deposit] Error:', err);
      return { success: false, error: err.reason || err.message };
    } finally {
      setLoading(false);
      setStep('');
    }
  }, [signer, address]);

  const withdraw = useCallback(async (shares) => {
    if (!signer) throw new Error('Connect wallet first');
    setLoading(true);

    try {
      const vault = new ethers.Contract(CONFIG.contracts.yieldPilot, YIELD_PILOT_ABI, signer);
      const tx = await vault.withdraw(shares);
      const receipt = await tx.wait();
      return { success: true, hash: tx.hash, receipt };
    } catch (err) {
      return { success: false, error: err.reason || err.message };
    } finally {
      setLoading(false);
    }
  }, [signer]);

  const getPosition = useCallback(async () => {
    if (!signer || !address) return null;
    const vault = new ethers.Contract(CONFIG.contracts.yieldPilot, YIELD_PILOT_ABI, signer);
    const [currentValue, costBasis, pnl] = await vault.getPositionValue(address);
    const pos = await vault.positions(address);
    return {
      currentValue: ethers.formatUnits(currentValue, 6),
      costBasis: ethers.formatUnits(costBasis, 6),
      pnl: ethers.formatUnits(pnl, 6),
      shares: pos.shares.toString(),
    };
  }, [signer, address]);

  return { deposit, withdraw, getPosition, loading, step };
}

// ═══════════════════════════════════════════════════════════════
// HOOK: useAgentDeploy — AgentForge deployment
// ═══════════════════════════════════════════════════════════════

export function useAgentDeploy() {
  const { signer, address } = useWallet();
  const [loading, setLoading] = useState(false);

  const subscribeToForge = useCallback(async (tier, months = 1) => {
    if (!signer) throw new Error('Connect wallet first');
    setLoading(true);

    try {
      const contract = new ethers.Contract(CONFIG.contracts.agentForge, AGENT_FORGE_ABI, signer);
      const tierEnum = tier === 'pro' ? 1 : 2; // Pro=1, Whale=2
      const price = tier === 'pro'
        ? ethers.parseEther(CONFIG.prices.forgeProMonthly)
        : ethers.parseEther(CONFIG.prices.forgeWhaleMonthly);

      const tx = await contract.subscribe(tierEnum, months, { value: price * BigInt(months) });
      const receipt = await tx.wait();
      return { success: true, hash: tx.hash, receipt };
    } catch (err) {
      return { success: false, error: err.reason || err.message };
    } finally {
      setLoading(false);
    }
  }, [signer]);

  const deployAgent = useCallback(async (templateId, name, agentWallet) => {
    if (!signer) throw new Error('Connect wallet first');
    setLoading(true);

    try {
      const contract = new ethers.Contract(CONFIG.contracts.agentForge, AGENT_FORGE_ABI, signer);
      const tx = await contract.deployAgent(templateId, name, agentWallet);
      const receipt = await tx.wait();
      return { success: true, hash: tx.hash, receipt };
    } catch (err) {
      return { success: false, error: err.reason || err.message };
    } finally {
      setLoading(false);
    }
  }, [signer]);

  const toggleAgent = useCallback(async (index) => {
    if (!signer) throw new Error('Connect wallet first');
    const contract = new ethers.Contract(CONFIG.contracts.agentForge, AGENT_FORGE_ABI, signer);
    const tx = await contract.toggleAgent(index);
    return tx.wait();
  }, [signer]);

  const getAgents = useCallback(async () => {
    if (!signer || !address) return [];
    const contract = new ethers.Contract(CONFIG.contracts.agentForge, AGENT_FORGE_ABI, signer);
    return contract.getUserAgents(address);
  }, [signer, address]);

  const getSubscription = useCallback(async () => {
    if (!signer || !address) return null;
    const contract = new ethers.Contract(CONFIG.contracts.agentForge, AGENT_FORGE_ABI, signer);
    const [tier, expiry, used, allowed] = await contract.getSubscription(address);
    return { tier: ['Free', 'Pro', 'Whale'][tier], expiry: Number(expiry), agentsUsed: Number(used), agentsAllowed: Number(allowed) };
  }, [signer, address]);

  return { subscribeToForge, deployAgent, toggleAgent, getAgents, getSubscription, loading };
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT: ConnectButton
// ═══════════════════════════════════════════════════════════════

export function ConnectButton({ style = {} }) {
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();

  if (isConnected) {
    return (
      <button
        onClick={disconnect}
        style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: 'rgba(34,197,94,0.1)', color: '#22c55e',
          border: '1px solid rgba(34,197,94,0.2)', cursor: 'pointer', ...style,
        }}
      >
        {address.slice(0, 6)}...{address.slice(-4)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      style={{
        padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
        background: 'linear-gradient(135deg, #0052ff, #3380ff)', color: '#fff',
        border: 'none', cursor: 'pointer', opacity: isConnecting ? 0.7 : 1, ...style,
      }}
    >
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// EXAMPLE: How to wire it into your App.jsx
// ═══════════════════════════════════════════════════════════════
/*

import { WalletProvider, ConnectButton, useSubscribe } from './wallet-integration';
import BaseAlpha from './base-alpha';
import YieldPilot from './yield-pilot';
import AgentForge from './agent-forge';

function App() {
  return (
    <WalletProvider>
      <div>
        <header>
          <ConnectButton />
        </header>
        <BaseAlpha />
      </div>
    </WalletProvider>
  );
}

// Inside BaseAlpha component, use the hooks:
function SubscribeButton() {
  const { subscribeToPro, loading } = useSubscribe();

  const handleSubscribe = async () => {
    const result = await subscribeToPro(1); // 1 month
    if (result.success) {
      alert('Subscribed! Tx: ' + result.hash);
    } else {
      alert('Failed: ' + result.error);
    }
  };

  return (
    <button onClick={handleSubscribe} disabled={loading}>
      {loading ? 'Confirming...' : 'Subscribe $9.99/mo'}
    </button>
  );
}

*/
