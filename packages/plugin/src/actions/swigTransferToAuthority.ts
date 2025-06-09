import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { fetchSwig, findSwigPda, signInstruction } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const swigTransferToAuthorityAction: Action = {
  name: 'SWIG_TRANSFER_TO_AUTHORITY',
  similes: ['SWIG_SEND_TO_AUTHORITY', 'TRANSFER_TO_SWIG_AUTHORITY', 'SEND_TO_SWIG_AUTHORITY'],
  description: 'Transfer SOL from the Swig wallet to another authority on the same Swig',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for swig transfer to authority patterns
    const hasSwigWord = /\bswig\b/.test(text);
    const hasTransferWord = /\b(transfer|send|pay)\b/.test(text);
    const hasAuthorityWord = /\b(authority|signer|role)\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);
    const hasFromWord = /\b(from|out|using)\b/.test(text);

    // Must have swig + transfer + authority + amount
    const isSwigTransferToAuthority =
      hasSwigWord && hasTransferWord && hasAuthorityWord && hasAmountPattern;

    // Also check for specific keyword patterns
    const keywords = [
      'transfer from swig to authority',
      'send from swig to authority',
      'transfer to swig authority',
      'send to swig authority',
      'transfer.*swig.*authority',
      'send.*swig.*authority',
      'swig transfer to authority',
      'swig send to authority',
      'use swig to transfer to authority',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        return text.includes(keyword);
      }
    });

    const result = isSwigTransferToAuthority || hasKeywordMatch;
    console.log('🔍 SWIG_TRANSFER_TO_AUTHORITY validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Swig word:',
      hasSwigWord,
      'Transfer word:',
      hasTransferWord,
      'Authority word:',
      hasAuthorityWord,
      'Amount:',
      hasAmountPattern,
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
    console.log('🔧 SWIG_TRANSFER_TO_AUTHORITY action handler called!');
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

      console.log('🔧 Step 4: Parsing transfer parameters...');
      const text = message.content.text || '';
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      const addressMatch = text.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);
      const roleIdMatch = text.match(/role\s*(?:id\s*)?(\d+)/i);

      if (!amountMatch) {
        throw new Error(
          "Please specify an amount to transfer (e.g., 'transfer 1.5 SOL from swig to authority 2dr69...' or 'transfer 1.5 SOL from swig to role 1')"
        );
      }

      const amount = parseFloat(amountMatch[1]);
      console.log('🔧 Transfer amount:', amount, 'SOL');

      console.log('🔧 Step 5: Fetching Swig wallet...');
      const swig = await fetchSwig(connection, swigAddress);
      const roles = swig.findRolesByEd25519SignerPk(wallet.publicKey);
      console.log('🔧 Found roles for current wallet:', roles.length);

      if (!roles.length) {
        throw new Error(
          'No roles found for your wallet in this Swig. You need to be an authority to initiate transfers.'
        );
      }

      const agentRole = roles[0];
      console.log('🔧 Using role:', agentRole);

      console.log('🔧 Step 6: Finding recipient authority...');
      let recipientAddress: PublicKey;

      if (roleIdMatch) {
        // Transfer to role ID
        const roleId = parseInt(roleIdMatch[1]);
        console.log('🔧 Looking for role ID:', roleId);

        const targetRole = swig.roles.find((role) => role.id === roleId);
        if (!targetRole) {
          throw new Error(`Role ID ${roleId} not found in this Swig wallet.`);
        }

        recipientAddress = new PublicKey(targetRole.authority.data);
        console.log('🔧 Found authority for role', roleId, ':', recipientAddress.toBase58());
      } else if (addressMatch) {
        // Transfer to specific address (must be an authority)
        recipientAddress = new PublicKey(addressMatch[1]);
        console.log('🔧 Checking if address is authority:', recipientAddress.toBase58());

        const isAuthority = swig.roles.some((role) =>
          new PublicKey(role.authority.data).equals(recipientAddress)
        );

        if (!isAuthority) {
          throw new Error(
            `Address ${recipientAddress.toBase58()} is not an authority on this Swig wallet.`
          );
        }
      } else {
        throw new Error(
          "Please specify either a role ID (e.g., 'role 1') or an authority address that exists on this Swig wallet."
        );
      }

      console.log('🔧 Recipient authority address:', recipientAddress.toBase58());

      console.log('🔧 Step 7: Creating transfer instruction...');
      // Create transfer instruction from Swig to authority
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: swigAddress,
        toPubkey: recipientAddress,
        lamports: amount * LAMPORTS_PER_SOL,
      });
      console.log('🔧 Transfer instruction created');

      console.log('🔧 Step 8: Creating sign instruction...');
      // Create sign instruction for the Swig
      const signIx = await signInstruction(agentRole, wallet.publicKey, [transferInstruction]);
      console.log('🔧 Sign instruction created');

      console.log('🔧 Step 9: Building and signing transaction...');
      const transaction = new Transaction().add(signIx);
      transaction.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      console.log('🔧 Latest blockhash:', latestBlockhash.blockhash);

      console.log('🔧 Step 10: Signing transaction...');
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log('🔧 Transaction signed');

      console.log('🔧 Step 11: Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('🔧 Transaction sent, signature:', signature);

      console.log('🔧 Step 12: Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('🔧 Transaction confirmed!');

      const responseContent = {
        text: `✅ Successfully transferred ${amount} SOL from Swig wallet to authority!\n\nFrom: ${swigAddress.toBase58()}\nTo Authority: ${recipientAddress.toBase58()}\nAmount: ${amount} SOL\nTransaction: ${signature}`,
        thought: `Successfully transferred ${amount} SOL from the Swig wallet to authority ${recipientAddress.toBase58()}.`,
        actions: ['SWIG_TRANSFER_TO_AUTHORITY', 'REPLY'],
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
      console.error('🔧 Swig transfer to authority error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to transfer from Swig wallet to authority: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'The transfer from Swig wallet to authority failed. This could be due to insufficient funds, invalid authority, insufficient permissions, or network issues.',
        actions: ['SWIG_TRANSFER_TO_AUTHORITY', 'REPLY'],
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
          text: 'Transfer 0.5 SOL from swig to authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll transfer 0.5 SOL from your Swig wallet to that authority.",
          action: 'SWIG_TRANSFER_TO_AUTHORITY',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Send 1.0 SOL from swig to role 1' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Transferring 1.0 SOL from Swig to role 1...',
          action: 'SWIG_TRANSFER_TO_AUTHORITY',
        },
      },
    ],
  ] as ActionExample[][],
};
