import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { createTransferInstruction, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { findSwigPda } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const transferToSwigAction: Action = {
  name: 'TRANSFER_TO_SWIG',
  similes: ['SEND_TO_SWIG', 'FUND_SWIG', 'DEPOSIT_TO_SWIG', 'TRANSFER_FUNDS_TO_SWIG'],
  description: 'Transfer SOL or SPL tokens from agent wallet to the Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for transfer/send + swig combinations more flexibly
    const hasTransferWord = /\b(transfer|send|fund|deposit)\b/.test(text);
    const hasSwigWord = /\bswig\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);

    // Must have transfer action + swig mention + amount
    const isTransferToSwig = hasTransferWord && hasSwigWord && hasAmountPattern;

    // Also check for specific keyword patterns for backwards compatibility
    const keywords = [
      'transfer to swig',
      'transfer.*swig',
      'send to swig',
      'send.*swig',
      'fund swig',
      'deposit to swig',
      'deposit.*swig',
      'send funds to swig',
      'to.*swig.*wallet',
      'to my swig',
      'to the swig',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        // Use regex for flexible matching
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        // Use simple string includes
        return text.includes(keyword);
      }
    });

    const result = isTransferToSwig || hasKeywordMatch;
    console.log('🔍 TRANSFER_TO_SWIG validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Transfer word:',
      hasTransferWord,
      'Swig word:',
      hasSwigWord,
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
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<boolean> => {
    console.log('🔧 TRANSFER_TO_SWIG action handler called!');
    console.log('🔧 Callback function present:', !!callback);
    console.log('🔧 Message content:', message.content.text);
    console.log('🔧 Responses array length:', responses?.length || 0);

    // Check if transfers are enabled
    const transfersEnabledSetting = runtime.getSetting('SWIG_TRANSFERS_ENABLED');
    const transfersEnabled =
      transfersEnabledSetting === undefined ? true : String(transfersEnabledSetting) === 'true';

    if (!transfersEnabled) {
      console.log('🔧 Transfer operation blocked - transfers are disabled');
      const errorContent = {
        text: `❌ Transfer operations are currently disabled. Set SWIG_TRANSFERS_ENABLED=true to enable transfers.`,
        thought: 'Transfer operations have been disabled in the plugin configuration.',
        actions: ['TRANSFER_TO_SWIG', 'REPLY'],
        source: message.content.source,
      };

      if (responses && responses.length > 0) {
        responses[0].content = errorContent;
      }

      if (callback) {
        await callback(errorContent);
      }

      return true;
    }

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

      // Extract amount and optional mint from message
      console.log('🔧 Step 4: Parsing transfer parameters...');
      const text = message.content.text || '';
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      const mintMatch = text.match(/(?:mint|token)[\s:]+([A-Za-z0-9]{32,44})/i);

      if (!amountMatch) {
        throw new Error("Please specify an amount to transfer (e.g., 'transfer 1.5 SOL to swig')");
      }

      const amount = parseFloat(amountMatch[1]);
      const mintAddress = mintMatch ? new PublicKey(mintMatch[1]) : null;
      console.log('🔧 Transfer amount:', amount);
      console.log('🔧 Mint address:', mintAddress?.toBase58() || 'SOL (native)');

      let transaction: Transaction;
      let transferDescription: string;

      if (!mintAddress) {
        console.log('🔧 Step 5: Creating SOL transfer instruction...');
        // Transfer native SOL
        const lamports = amount * LAMPORTS_PER_SOL;
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: swigAddress,
          lamports,
        });

        transaction = new Transaction().add(transferInstruction);
        transferDescription = `${amount} SOL`;
      } else {
        console.log('🔧 Step 5: Creating SPL token transfer instruction...');
        // Transfer SPL token
        const fromAta = await getAssociatedTokenAddress(mintAddress, wallet.publicKey, true);
        const toAta = await getAssociatedTokenAddress(mintAddress, swigAddress, true);
        const mintInfo = await getMint(connection, mintAddress);
        const adjustedAmount = amount * Math.pow(10, mintInfo.decimals);

        const transferInstruction = createTransferInstruction(
          fromAta,
          toAta,
          wallet.publicKey,
          adjustedAmount
        );

        transaction = new Transaction().add(transferInstruction);
        transferDescription = `${amount} tokens (${mintAddress.toBase58().substring(0, 8)}...)`;
      }

      console.log('🔧 Step 6: Building and signing transaction...');
      transaction.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      console.log('🔧 Latest blockhash:', latestBlockhash.blockhash);

      console.log('🔧 Step 7: Signing transaction...');
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log('🔧 Transaction signed');

      console.log('🔧 Step 8: Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('🔧 Transaction sent, signature:', signature);

      console.log('🔧 Step 9: Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('🔧 Transaction confirmed!');

      const responseContent = {
        text: `✅ Successfully transferred ${transferDescription} to Swig wallet!\n\nSwig Address: ${swigAddress.toBase58()}\nTransaction: ${signature}`,
        thought: `Successfully transferred ${transferDescription} from the agent wallet to the Swig wallet.`,
        actions: ['TRANSFER_TO_SWIG', 'REPLY'],
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
      console.error('🔧 Transfer to swig error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to transfer to Swig wallet: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        thought:
          'The transfer to Swig wallet failed. This could be due to insufficient funds, network issues, or invalid parameters.',
        actions: ['TRANSFER_TO_SWIG', 'REPLY'],
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
        content: { text: 'Transfer 1.5 SOL to my swig wallet' },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll transfer 1.5 SOL to your Swig wallet.",
          action: 'TRANSFER_TO_SWIG',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'Fund the swig with 0.1 SOL' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Transferring 0.1 SOL to your Swig wallet...',
          action: 'TRANSFER_TO_SWIG',
        },
      },
    ],
  ] as ActionExample[][],
};
