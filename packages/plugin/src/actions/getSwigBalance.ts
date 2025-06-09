import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { findSwigPda } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const getSwigBalanceAction: Action = {
  name: 'GET_SWIG_BALANCE',
  similes: ['CHECK_SWIG_BALANCE', 'SWIG_BALANCE', 'SHOW_SWIG_BALANCE', 'WALLET_BALANCE'],
  description: 'Get the balance of SOL or SPL tokens in the Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    const keywords = [
      'swig balance',
      'check swig',
      'balance of swig',
      'how much in swig',
      'swig wallet balance',
    ];

    console.log(
      '🔍 GET_SWIG_BALANCE validation:',
      `"${text}" -> ${keywords.some((keyword) => text.includes(keyword))}`
    );
    return keywords.some((keyword) => text.includes(keyword));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<boolean> => {
    console.log('🔧 GET_SWIG_BALANCE action handler called!');
    console.log('🔧 Callback function present:', !!callback);
    console.log('🔧 Message content:', message.content.text);
    console.log('🔧 Responses array length:', responses?.length || 0);

    try {
      console.log('🔧 Step 1: Getting Solana wallet...');
      const wallet = await getSolanaWallet(runtime);
      if (!wallet) {
        console.log('🔧 ERROR: No wallet configured');
        throw new Error(
          'Solana wallet not configured. Please set SOLANA_PRIVATE_KEY in runtime settings.'
        );
      }
      console.log('🔧 Wallet public key:', wallet.publicKey.toBase58());

      console.log('🔧 Step 2: Getting Solana connection...');
      const connection = getSolanaConnection(runtime);
      console.log('🔧 Connection RPC endpoint:', connection.rpcEndpoint);

      console.log('🔧 Step 3: Finding Swig PDA...');
      const [swigAddress] = findSwigPda(wallet.publicKey.toBytes());
      console.log('🔧 Swig address:', swigAddress.toBase58());

      // Check if specific token is requested
      console.log('🔧 Step 4: Parsing balance request...');
      const text = message.content.text || '';
      const mintMatch = text.match(/(?:mint|token)[\s:]+([A-Za-z0-9]{32,44})/i);
      console.log('🔧 Mint address requested:', mintMatch?.[1] || 'SOL (native)');

      let balanceText: string;

      if (!mintMatch) {
        console.log('🔧 Step 5: Getting SOL balance...');
        // Get SOL balance
        const balance = await connection.getBalance(swigAddress);
        const solBalance = balance / LAMPORTS_PER_SOL;
        console.log('🔧 SOL balance:', solBalance, 'SOL');
        balanceText = `SOL Balance: ${solBalance.toFixed(9)} SOL`;
      } else {
        console.log('🔧 Step 5: Getting SPL token balance...');
        // Get SPL token balance
        const mintAddress = new PublicKey(mintMatch[1]);
        const tokenAddress = getAssociatedTokenAddressSync(mintAddress, swigAddress, true);
        console.log('🔧 Token account address:', tokenAddress.toBase58());

        try {
          const tokenAccount = await connection.getTokenAccountBalance(tokenAddress);
          const tokenBalance = tokenAccount.value.uiAmount || 0;
          console.log('🔧 Token balance:', tokenBalance, 'tokens');
          balanceText = `Token Balance: ${tokenBalance} tokens\nMint: ${mintAddress.toBase58()}`;
        } catch (error) {
          console.log('🔧 Token account not found, balance is 0');
          balanceText = `Token Balance: 0 tokens (account not found)\nMint: ${mintAddress.toBase58()}`;
        }
      }

      const responseContent = {
        text: `💰 Swig Wallet Balance\n\nSwig Address: ${swigAddress.toBase58()}\n${balanceText}`,
        thought: 'Successfully retrieved the Swig wallet balance information.',
        actions: ['GET_SWIG_BALANCE', 'REPLY'],
        source: message.content.source,
      };

      // Update the response in the responses array so REPLY action uses our content
      if (responses && responses.length > 0) {
        console.log('🔧 Updating responses array with success content');
        responses[0].content = responseContent;
      }

      // Send response using callback
      console.log('🔧 Sending success response via callback');
      console.log('🔧 Response content:', JSON.stringify(responseContent, null, 2));
      if (callback) {
        console.log('🔧 Calling callback...');
        await callback(responseContent);
        console.log('🔧 Callback completed successfully!');
      } else {
        console.log('⚠️ No callback provided to action handler');
      }

      return true;
    } catch (error) {
      console.error('🔧 Get swig balance error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to get Swig wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'Failed to retrieve the Swig wallet balance. This could be due to network issues or wallet configuration problems.',
        actions: ['GET_SWIG_BALANCE', 'REPLY'],
        source: message.content.source,
      };

      // Update the response in the responses array so REPLY action uses our content
      if (responses && responses.length > 0) {
        console.log('🔧 Updating responses array with error content');
        responses[0].content = errorContent;
      }

      // Send error response using callback
      console.log('🔧 Sending error response via callback');
      console.log('🔧 Error content:', JSON.stringify(errorContent, null, 2));
      if (callback) {
        console.log('🔧 Calling callback with error...');
        await callback(errorContent);
        console.log('🔧 Error callback completed');
      } else {
        console.log('⚠️ No callback provided for error response');
      }

      return true;
    }
  },

  examples: [
    [
      {
        name: 'User',
        content: { text: "What's the balance of my swig wallet?" },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll check your Swig wallet balance.",
          action: 'GET_SWIG_BALANCE',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Check swig balance' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking your Swig wallet balance...',
          action: 'GET_SWIG_BALANCE',
        },
      },
    ],
  ] as ActionExample[][],
};
