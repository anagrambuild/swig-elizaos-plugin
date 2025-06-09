import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { PublicKey } from '@solana/web3.js';
import { fetchSwig, findSwigPda } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const getSwigAuthoritiesAction: Action = {
  name: 'GET_SWIG_AUTHORITIES',
  similes: [
    'GET_AUTHORITIES',
    'LIST_SWIG_AUTHORITIES',
    'SHOW_SWIG_AUTHORITIES',
    'CHECK_SWIG_AUTHORITIES',
    'SWIG_AUTHORITIES',
  ],
  description: 'Get all authorities (signers) on the Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for authority-related queries
    const hasAuthorityWord = /\b(authorities|authority|signers|signer)\b/.test(text);
    const hasSwigWord = /\bswig\b/.test(text);
    const hasListWord = /\b(list|show|get|check|who|what)\b/.test(text);

    // Must have authority + swig mention + query intent
    const isAuthorityQuery = hasAuthorityWord && hasSwigWord && hasListWord;

    // Also check for specific keyword patterns
    const keywords = [
      'swig authorities',
      'authorities on swig',
      'swig signers',
      'signers on swig',
      'who can sign',
      'list authorities',
      'show authorities',
      'get authorities',
    ];

    const hasKeywordMatch = keywords.some((keyword) => text.includes(keyword));

    const result = isAuthorityQuery || hasKeywordMatch;
    console.log('🔍 GET_SWIG_AUTHORITIES validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Authority word:',
      hasAuthorityWord,
      'Swig word:',
      hasSwigWord,
      'List word:',
      hasListWord,
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
    console.log('🔧 GET_SWIG_AUTHORITIES action handler called!');
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

      console.log('🔧 Step 4: Fetching Swig wallet...');
      const swig = await fetchSwig(connection, swigAddress);
      console.log('🔧 Swig fetched, total roles:', swig.roles.length);

      console.log('🔧 Step 5: Processing authorities...');
      const authorities = swig.roles.map((role) => {
        const authorityPubkey = new PublicKey(role.authority.data);
        console.log('🔧 Role ID:', role.id, 'Authority:', authorityPubkey.toBase58());
        return {
          roleId: role.id,
          address: authorityPubkey.toBase58(),
          isCurrentWallet: authorityPubkey.equals(wallet.publicKey),
        };
      });

      // Format authorities list for display
      const authoritiesList = authorities
        .map((auth, index) => {
          const marker = auth.isCurrentWallet ? ' ← Your wallet' : '';
          return `${index + 1}. Role ID: ${auth.roleId}\n   Address: ${auth.address}${marker}`;
        })
        .join('\n\n');

      const responseContent = {
        text: `👥 Swig Wallet Authorities\n\nSwig Address: ${swigAddress.toBase58()}\nTotal Authorities: ${authorities.length}\n\n${authoritiesList}`,
        thought: 'Successfully retrieved all authorities from the Swig wallet.',
        actions: ['GET_SWIG_AUTHORITIES', 'REPLY'],
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
      console.error('🔧 Get swig authorities error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to get Swig wallet authorities: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'Failed to retrieve the authorities from the Swig wallet. This could be due to the wallet not existing, network issues, or configuration problems.',
        actions: ['GET_SWIG_AUTHORITIES', 'REPLY'],
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
        content: { text: 'Who are the authorities on my swig wallet?' },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll check the authorities on your Swig wallet.",
          action: 'GET_SWIG_AUTHORITIES',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'List swig signers' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Getting the list of signers for your Swig wallet...',
          action: 'GET_SWIG_AUTHORITIES',
        },
      },
    ],
  ] as ActionExample[][],
};
