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
import { getSolanaConnection, getSolanaWallet, sendAndConfirmTransaction } from '../utils.js';

export const swigTransferToAddressAction: Action = {
  name: 'SWIG_TRANSFER_TO_ADDRESS',
  similes: ['SWIG_SEND_TO_ADDRESS', 'TRANSFER_FROM_SWIG', 'SEND_FROM_SWIG', 'SWIG_TRANSFER_SOL'],
  description: 'Transfer SOL from the Swig wallet to any address',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for swig transfer patterns
    const hasSwigWord = /\bswig\b/.test(text);
    const hasTransferWord = /\b(transfer|send|pay)\b/.test(text);
    const hasFromWord = /\b(from|out|using)\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);
    const hasAddressPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);

    // Must have swig + transfer + amount + recipient (from swig to address)
    const isSwigTransfer =
      hasSwigWord && hasTransferWord && hasAmountPattern && (hasFromWord || hasAddressPattern);

    // Also check for specific keyword patterns
    const keywords = [
      'transfer from swig',
      'send from swig',
      'transfer using swig',
      'send using swig',
      'swig transfer to',
      'swig send to',
      'transfer.*from.*swig',
      'send.*from.*swig',
      'use swig to transfer',
      'use swig to send',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        return text.includes(keyword);
      }
    });

    const result = isSwigTransfer || hasKeywordMatch;
    console.log('🔍 SWIG_TRANSFER_TO_ADDRESS validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Swig word:',
      hasSwigWord,
      'Transfer word:',
      hasTransferWord,
      'From word:',
      hasFromWord,
      'Amount:',
      hasAmountPattern,
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
    console.log('🔧 SWIG_TRANSFER_TO_ADDRESS action handler called!');
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

      if (!amountMatch) {
        throw new Error(
          "Please specify an amount to transfer (e.g., 'transfer 1.5 SOL from swig to...')"
        );
      }

      if (!addressMatch) {
        throw new Error(
          "Please specify a recipient address (e.g., 'transfer 1.5 SOL from swig to 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms')"
        );
      }

      const amount = parseFloat(amountMatch[1]);
      const recipientAddress = new PublicKey(addressMatch[1]);
      console.log('🔧 Transfer amount:', amount, 'SOL');
      console.log('🔧 Recipient address:', recipientAddress.toBase58());

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

      console.log('🔧 Step 6: Creating transfer instruction...');
      // Create transfer instruction from Swig to recipient
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: swigAddress,
        toPubkey: recipientAddress,
        lamports: amount * LAMPORTS_PER_SOL,
      });
      console.log('🔧 Transfer instruction created');

      console.log('🔧 Step 7: Creating sign instruction...');
      // Create sign instruction for the Swig
      const signIx = await signInstruction(agentRole, wallet.publicKey, [transferInstruction]);
      console.log('🔧 Sign instruction created');

      console.log('🔧 Step 8: Building and signing transaction...');
      const transaction = new Transaction().add(signIx);
      transaction.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      console.log('🔧 Latest blockhash:', latestBlockhash.blockhash);

      console.log('🔧 Step 9: Signing transaction...');
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log('🔧 Transaction signed');

      console.log('🔧 Step 10: Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('🔧 Transaction sent, signature:', signature);

      console.log('🔧 Step 11: Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('🔧 Transaction confirmed!');

      const responseContent = {
        text: `✅ Successfully transferred ${amount} SOL from Swig wallet!\n\nFrom: ${swigAddress.toBase58()}\nTo: ${recipientAddress.toBase58()}\nAmount: ${amount} SOL\nTransaction: ${signature}`,
        thought: `Successfully transferred ${amount} SOL from the Swig wallet to ${recipientAddress.toBase58()}.`,
        actions: ['SWIG_TRANSFER_TO_ADDRESS', 'REPLY'],
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
      console.error('🔧 Swig transfer to address error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to transfer from Swig wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'The transfer from Swig wallet failed. This could be due to insufficient funds, insufficient authority permissions, network issues, or invalid parameters.',
        actions: ['SWIG_TRANSFER_TO_ADDRESS', 'REPLY'],
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
          text: 'Transfer 1.5 SOL from swig to 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll transfer 1.5 SOL from your Swig wallet to that address.",
          action: 'SWIG_TRANSFER_TO_ADDRESS',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Send 0.1 SOL using swig to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Using your Swig wallet to send 0.1 SOL...',
          action: 'SWIG_TRANSFER_TO_ADDRESS',
        },
      },
    ],
  ] as ActionExample[][],
};
