import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  getMint,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { findSwigPda } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const transferTokenToSwigAction: Action = {
  name: 'TRANSFER_TOKEN_TO_SWIG',
  similes: [
    'SEND_TOKEN_TO_SWIG',
    'FUND_SWIG_TOKEN',
    'DEPOSIT_TOKEN_TO_SWIG',
    'TRANSFER_SPL_TO_SWIG',
  ],
  description: 'Transfer SPL tokens from agent wallet to the Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for token transfer patterns
    const hasTransferWord = /\b(transfer|send|fund|deposit)\b/.test(text);
    const hasSwigWord = /\bswig\b/.test(text);
    const hasTokenWord = /\b(token|spl|mint)\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);
    const hasMintPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);

    // Must have transfer action + token + swig mention + amount + mint
    const isTokenTransferToSwig =
      hasTransferWord && hasSwigWord && hasTokenWord && hasAmountPattern;

    // Also check for specific keyword patterns
    const keywords = [
      'transfer token to swig',
      'send token to swig',
      'transfer spl to swig',
      'send spl to swig',
      'fund swig with token',
      'deposit token to swig',
      'transfer.*token.*swig',
      'send.*token.*swig',
      'to.*swig.*token',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        return text.includes(keyword);
      }
    });

    const result = isTokenTransferToSwig || hasKeywordMatch;
    console.log('🔍 TRANSFER_TOKEN_TO_SWIG validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Transfer word:',
      hasTransferWord,
      'Swig word:',
      hasSwigWord,
      'Token word:',
      hasTokenWord,
      'Amount:',
      hasAmountPattern,
      'Mint:',
      hasMintPattern,
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
    console.log('🔧 TRANSFER_TOKEN_TO_SWIG action handler called!');
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
        actions: ['TRANSFER_TOKEN_TO_SWIG', 'REPLY'],
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

      console.log('🔧 Step 4: Parsing transfer parameters...');
      const text = message.content.text || '';
      const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
      const mintMatch = text.match(/\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/);

      if (!amountMatch) {
        throw new Error(
          "Please specify an amount to transfer (e.g., 'transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU to swig')"
        );
      }

      if (!mintMatch) {
        throw new Error(
          "Please specify the token mint address (e.g., 'transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU to swig')"
        );
      }

      const amount = parseFloat(amountMatch[1]);
      const mintAddress = new PublicKey(mintMatch[1]);
      console.log('🔧 Transfer amount:', amount);
      console.log('🔧 Mint address:', mintAddress.toBase58());

      console.log('🔧 Step 5: Getting mint info...');
      const mintInfo = await getMint(connection, mintAddress);
      const adjustedAmount = amount * Math.pow(10, mintInfo.decimals);
      console.log('🔧 Token decimals:', mintInfo.decimals);
      console.log('🔧 Adjusted amount:', adjustedAmount);

      console.log('🔧 Step 6: Getting token accounts...');
      const fromAta = await getAssociatedTokenAddress(mintAddress, wallet.publicKey, false);
      const toAta = await getAssociatedTokenAddress(mintAddress, swigAddress, true);
      console.log('🔧 From ATA:', fromAta.toBase58());
      console.log('🔧 To ATA:', toAta.toBase58());

      console.log('🔧 Step 7: Building transaction...');
      const transaction = new Transaction();

      // Check if the Swig's token account exists
      let toAccountExists = false;
      try {
        await getAccount(connection, toAta);
        toAccountExists = true;
        console.log('🔧 Swig token account exists');
      } catch (error) {
        console.log('🔧 Swig token account does not exist, will create it');
      }

      // Create the Swig's token account if it doesn't exist
      if (!toAccountExists) {
        console.log('🔧 Adding create ATA instruction...');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          toAta, // associated token account
          swigAddress, // owner
          mintAddress // mint
        );
        transaction.add(createAtaIx);
      }

      console.log('🔧 Step 8: Adding transfer instruction...');
      const transferInstruction = createTransferInstruction(
        fromAta, // source
        toAta, // destination
        wallet.publicKey, // owner
        adjustedAmount // amount
      );
      transaction.add(transferInstruction);

      console.log('🔧 Step 9: Setting transaction details...');
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

      const tokenSymbol = mintAddress.toBase58().substring(0, 8) + '...';
      const responseContent = {
        text: `✅ Successfully transferred ${amount} ${tokenSymbol} tokens to Swig wallet!\n\nSwig Address: ${swigAddress.toBase58()}\nToken Mint: ${mintAddress.toBase58()}\nAmount: ${amount} tokens\nTransaction: ${signature}`,
        thought: `Successfully transferred ${amount} SPL tokens to the Swig wallet.`,
        actions: ['TRANSFER_TOKEN_TO_SWIG', 'REPLY'],
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
      console.error('🔧 Transfer token to swig error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to transfer token to Swig wallet: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        thought:
          'The token transfer to Swig wallet failed. This could be due to insufficient token balance, network issues, or invalid parameters.',
        actions: ['TRANSFER_TOKEN_TO_SWIG', 'REPLY'],
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
          text: 'Transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU to swig',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll transfer 100 SPL tokens to your Swig wallet.",
          action: 'TRANSFER_TOKEN_TO_SWIG',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Send 50 spl tokens EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v to my swig',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Transferring 50 SPL tokens to your Swig wallet...',
          action: 'TRANSFER_TOKEN_TO_SWIG',
        },
      },
    ],
  ] as ActionExample[][],
};
