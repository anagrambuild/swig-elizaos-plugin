import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { getAssociatedTokenAddress, getAccount, getMint } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { findSwigPda } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const getSwigTokenBalanceAction: Action = {
  name: 'GET_SWIG_TOKEN_BALANCE',
  similes: [
    'SWIG_TOKEN_BALANCE',
    'CHECK_SWIG_TOKEN_BALANCE',
    'SWIG_SPL_BALANCE',
    'GET_SWIG_SPL_BALANCE',
    'SHOW_SWIG_TOKEN_BALANCE',
  ],
  description: 'Get the balance of a specific SPL token in the Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for swig token balance patterns
    const hasSwigWord = /\bswig\b/.test(text);
    const hasBalanceWord = /\b(balance|amount|how much)\b/.test(text);
    const hasTokenWord = /\b(token|spl|mint)\b/.test(text);
    const hasAddressPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);

    // Must have swig + balance + (token or address)
    const isSwigTokenBalance = hasSwigWord && hasBalanceWord && (hasTokenWord || hasAddressPattern);

    // Also check for specific keyword patterns
    const keywords = [
      'swig token balance',
      'swig spl balance',
      'token balance in swig',
      'spl balance in swig',
      'check swig token balance',
      'get swig token balance',
      'show swig token balance',
      'what is my swig token balance',
      'how much token in swig',
      'swig balance for token',
      'balance.*swig.*token',
      'token.*balance.*swig',
      'swig.*token.*balance',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        return text.includes(keyword);
      }
    });

    const result = isSwigTokenBalance || hasKeywordMatch;
    console.log('🔍 GET_SWIG_TOKEN_BALANCE validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Swig word:',
      hasSwigWord,
      'Balance word:',
      hasBalanceWord,
      'Token word:',
      hasTokenWord,
      'Address:',
      hasAddressPattern,
      'Keyword match:',
      hasKeywordMatch
    );

    return result;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: any,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<boolean> => {
    console.log('🔧 GET_SWIG_TOKEN_BALANCE action handler called!');
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

      console.log('🔧 Step 4: Parsing mint address...');
      const text = message.content.text || '';

      // Look for mint address in various formats
      const mintMatch = text.match(/mint\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      const forTokenMatch = text.match(/for\s+(?:token\s+)?([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      const ofTokenMatch = text.match(/of\s+(?:token\s+)?([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      const addresses = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];

      let mintAddress: PublicKey;

      if (mintMatch && mintMatch[1]) {
        mintAddress = new PublicKey(mintMatch[1]);
      } else if (forTokenMatch && forTokenMatch[1]) {
        mintAddress = new PublicKey(forTokenMatch[1]);
      } else if (ofTokenMatch && ofTokenMatch[1]) {
        mintAddress = new PublicKey(ofTokenMatch[1]);
      } else if (addresses.length > 0 && addresses[0]) {
        // Use the first address found
        mintAddress = new PublicKey(addresses[0]);
      } else {
        throw new Error(
          "Please specify a token mint address (e.g., 'get swig token balance for 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')"
        );
      }

      console.log('🔧 Mint address:', mintAddress.toBase58());

      console.log('🔧 Step 5: Getting mint info...');
      let mintInfo;
      try {
        mintInfo = await getMint(connection, mintAddress);
        console.log('🔧 Token decimals:', mintInfo.decimals);
      } catch (error) {
        throw new Error(`Invalid or non-existent token mint: ${mintAddress.toBase58()}`);
      }

      console.log('🔧 Step 6: Getting associated token account...');
      const ata = await getAssociatedTokenAddress(mintAddress, swigAddress, true);
      console.log('🔧 Associated token account:', ata.toBase58());

      console.log('🔧 Step 7: Getting token account balance...');
      let balance = 0;
      let tokenAccount;

      try {
        tokenAccount = await getAccount(connection, ata);
        balance = Number(tokenAccount.amount);
        console.log('🔧 Raw balance:', balance);
      } catch (error) {
        console.log('🔧 Token account does not exist, balance is 0');
        balance = 0;
      }

      const adjustedBalance = balance / Math.pow(10, mintInfo.decimals);
      console.log('🔧 Adjusted balance:', adjustedBalance);

      const tokenSymbol = mintAddress.toBase58().substring(0, 8) + '...';
      const responseContent = {
        text: `🏦 Swig Token Balance\n\nWallet: ${swigAddress.toBase58()}\nToken Mint: ${mintAddress.toBase58()}\nToken Symbol: ${tokenSymbol}\nBalance: ${adjustedBalance.toLocaleString()} tokens\nRaw Balance: ${balance.toLocaleString()} (${mintInfo.decimals} decimals)\n\n${tokenAccount ? 'Token account exists' : 'No token account (balance is 0)'}`,
        thought: `Retrieved token balance for ${tokenSymbol} in Swig wallet: ${adjustedBalance} tokens.`,
        actions: ['GET_SWIG_TOKEN_BALANCE', 'REPLY'],
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
      console.error('🔧 Get Swig token balance error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to get Swig token balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'The token balance query failed. This could be due to invalid mint address, network issues, or wallet configuration problems.',
        actions: ['GET_SWIG_TOKEN_BALANCE', 'REPLY'],
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
        content: {
          text: 'Get swig token balance for 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll check the token balance in your Swig wallet.",
          action: 'GET_SWIG_TOKEN_BALANCE',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'What is my swig balance of token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Checking your Swig SPL token balance...',
          action: 'GET_SWIG_TOKEN_BALANCE',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Check swig token balance' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Please specify the token mint address to check the balance.',
          action: 'GET_SWIG_TOKEN_BALANCE',
        },
      },
    ],
  ] as ActionExample[][],
};
