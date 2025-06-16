import { PublicKey } from '@solana/web3.js';
import { IAgentRuntime } from '@elizaos/core';

export interface SolanaWalletProvider {
  connection: any;
  publicKey: PublicKey;
  signTransaction: (transaction: any) => Promise<any>;
  signAllTransactions: (transactions: any[]) => Promise<any[]>;
}

export interface SwigWalletConfig {
  rpcUrl?: string;
  commitment?: string;
}

export interface SwigPluginConfig {
  transfersEnabled?: boolean;
}

export interface SwigAuthority {
  roleId: number;
  address: string;
}

export interface SwigTransferResult {
  signature: string;
  amount: number;
  recipient?: string;
  mint?: string;
}

export interface SolanaService {
  getWalletProvider(runtime: IAgentRuntime): SolanaWalletProvider | null;
}

// Extend IAgentRuntime to include Solana-specific methods
declare module '@elizaos/core' {
  interface IAgentRuntime {
    getSolanaWallet?(): Promise<SolanaWalletProvider | null>;
  }
}
