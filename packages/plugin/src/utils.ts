import { Connection, Keypair, Transaction } from '@solana/web3.js';
import { IAgentRuntime, UUID } from '@elizaos/core';
import { SolanaWalletProvider, SwigPluginConfig } from './types.js';

/**
 * Get Solana connection from runtime settings
 */
export function getSolanaConnection(runtime: IAgentRuntime): Connection {
  const rpcUrl = runtime.getSetting('SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Get Solana wallet from runtime settings
 */
export async function getSolanaWallet(
  runtime: IAgentRuntime
): Promise<SolanaWalletProvider | null> {
  try {
    const privateKeyString = runtime.getSetting('SOLANA_PRIVATE_KEY');
    if (!privateKeyString) {
      console.warn('SOLANA_PRIVATE_KEY not found in runtime settings');
      return null;
    }

    let privateKey: Uint8Array;

    if (privateKeyString.startsWith('[') && privateKeyString.endsWith(']')) {
      // Handle JSON array format
      const privateKeyArray = JSON.parse(privateKeyString);
      privateKey = new Uint8Array(privateKeyArray);
    } else {
      // Handle base58 format
      const bs58 = await import('bs58');
      privateKey = bs58.default.decode(privateKeyString);
    }

    const keypair = Keypair.fromSecretKey(privateKey);
    const connection = getSolanaConnection(runtime);

    return {
      connection,
      publicKey: keypair.publicKey,
      signTransaction: async (transaction: Transaction) => {
        transaction.sign(keypair);
        return transaction;
      },
      signAllTransactions: async (transactions: Transaction[]) => {
        return transactions.map((tx) => {
          tx.sign(keypair);
          return tx;
        });
      },
    };
  } catch (error) {
    console.error('Failed to create Solana wallet:', error);
    return null;
  }
}

/**
 * Send and confirm a transaction
 */
export async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[]
): Promise<string> {
  const signature = await connection.sendTransaction(transaction, signers, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

/**
 * Generate a UUID for ElizaOS compatibility
 */
export function generateUUID(): UUID {
  return crypto.randomUUID() as UUID;
}

/**
 * Format SOL amount for display
 */
export function formatSOL(lamports: number): string {
  return (lamports / 1e9).toFixed(9);
}

/**
 * Parse SOL amount to lamports
 */
export function parseSOL(sol: string | number): number {
  return Math.round(Number(sol) * 1e9);
}

/**
 * Get Swig plugin configuration from runtime settings
 */
export function getSwigConfig(runtime: IAgentRuntime): SwigPluginConfig {
  const transfersEnabled = runtime.getSetting('SWIG_TRANSFERS_ENABLED');

  return {
    transfersEnabled: transfersEnabled === undefined ? true : String(transfersEnabled) === 'true',
  };
}

/**
 * Check if transfers are enabled in the configuration
 */
export function areTransfersEnabled(runtime: IAgentRuntime): boolean {
  const config = getSwigConfig(runtime);
  return config.transfersEnabled ?? true;
}

/**
 * Validate if transfers are enabled and return error content if not
 */
export function validateTransfersEnabled(
  runtime: IAgentRuntime,
  actionName: string,
  messageSource?: string
) {
  const transfersEnabledSetting = runtime.getSetting('SWIG_TRANSFERS_ENABLED');
  const transfersEnabled =
    transfersEnabledSetting === undefined ? true : String(transfersEnabledSetting) === 'true';

  if (!transfersEnabled) {
    return {
      text: `❌ Transfer operations are currently disabled. Set SWIG_TRANSFERS_ENABLED=true to enable transfers.`,
      thought: 'Transfer operations have been disabled in the plugin configuration.',
      actions: [actionName, 'REPLY'],
      source: messageSource,
    };
  }

  return null; // No error, transfers enabled
}
