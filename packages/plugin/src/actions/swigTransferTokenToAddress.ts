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
import { fetchSwig, findSwigPda, signInstruction } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const swigTransferTokenToAddressAction: Action = {
  name: 'SWIG_TRANSFER_TOKEN_TO_ADDRESS',
  similes: [
    'SWIG_SEND_TOKEN_TO_ADDRESS',
    'TRANSFER_TOKEN_FROM_SWIG',
    'SEND_TOKEN_FROM_SWIG',
    'SWIG_TRANSFER_SPL',
  ],
  description: 'Transfer SPL tokens from the Swig wallet to any address',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for swig token transfer patterns
    const hasSwigWord = /\bswig\b/.test(text);
    const hasTransferWord = /\b(transfer|send|pay)\b/.test(text);
    const hasTokenWord = /\b(token|spl|mint)\b/.test(text);
    const hasFromWord = /\b(from|out|using)\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);
    const hasAddressPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);

    // Must have swig + transfer + token + amount + address + from
    const isSwigTokenTransfer =
      hasSwigWord &&
      hasTransferWord &&
      hasTokenWord &&
      hasAmountPattern &&
      (hasFromWord || hasAddressPattern);

    // Also check for specific keyword patterns
    const keywords = [
      'transfer token from swig',
      'send token from swig',
      'transfer spl from swig',
      'send spl from swig',
      'transfer.*token.*from.*swig',
      'send.*token.*from.*swig',
      'swig transfer token to',
      'swig send token to',
      'use swig to transfer token',
      'use swig to send token',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        return text.includes(keyword);
      }
    });

    const result = isSwigTokenTransfer || hasKeywordMatch;
    console.log('🔍 SWIG_TRANSFER_TOKEN_TO_ADDRESS validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Swig word:',
      hasSwigWord,
      'Transfer word:',
      hasTransferWord,
      'Token word:',
      hasTokenWord,
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
    console.log('🔧 SWIG_TRANSFER_TOKEN_TO_ADDRESS action handler called!');
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
      const addresses = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];

      if (!amountMatch) {
        throw new Error(
          "Please specify an amount to transfer (e.g., 'transfer 100 tokens mint 4zMMC9... from swig to 2dr69...')"
        );
      }

      if (addresses.length < 2) {
        throw new Error(
          "Please specify both mint address and recipient address (e.g., 'transfer 100 tokens mint 4zMMC9... from swig to 2dr69...')"
        );
      }

      const amount = parseFloat(amountMatch[1]);

      // Try to determine which address is mint and which is recipient
      // Usually mint comes after "mint" keyword, recipient comes after "to" keyword
      const mintMatch = text.match(/mint\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      const recipientMatch = text.match(/to\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i);

      let mintAddress: PublicKey;
      let recipientAddress: PublicKey;

      if (mintMatch && recipientMatch && mintMatch[1] && recipientMatch[1]) {
        mintAddress = new PublicKey(mintMatch[1]);
        recipientAddress = new PublicKey(recipientMatch[1]);
      } else if (addresses.length >= 2 && addresses[0] && addresses[1]) {
        // Fallback: assume first address is mint, second is recipient
        mintAddress = new PublicKey(addresses[0]);
        recipientAddress = new PublicKey(addresses[1]);
      } else {
        throw new Error(
          "Could not identify mint and recipient addresses. Please use format: 'transfer [amount] tokens mint [mint_address] from swig to [recipient_address]'"
        );
      }

      console.log('🔧 Transfer amount:', amount);
      console.log('🔧 Mint address:', mintAddress.toBase58());
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

      console.log('🔧 Step 6: Getting mint info...');
      const mintInfo = await getMint(connection, mintAddress);
      const adjustedAmount = amount * Math.pow(10, mintInfo.decimals);
      console.log('🔧 Token decimals:', mintInfo.decimals);
      console.log('🔧 Adjusted amount:', adjustedAmount);

      console.log('🔧 Step 7: Getting token accounts...');
      const fromAta = await getAssociatedTokenAddress(mintAddress, swigAddress, true);
      const toAta = await getAssociatedTokenAddress(mintAddress, recipientAddress, false);
      console.log('🔧 From ATA (Swig):', fromAta.toBase58());
      console.log('🔧 To ATA (Recipient):', toAta.toBase58());

      console.log('🔧 Step 8: Building transaction...');
      const instructions = [];

      // Check if the recipient's token account exists
      let toAccountExists = false;
      try {
        await getAccount(connection, toAta);
        toAccountExists = true;
        console.log('🔧 Recipient token account exists');
      } catch (error) {
        console.log('🔧 Recipient token account does not exist, will create it');
      }

      // Create the recipient's token account if it doesn't exist
      if (!toAccountExists) {
        console.log('🔧 Adding create ATA instruction...');
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          toAta, // associated token account
          recipientAddress, // owner
          mintAddress // mint
        );
        instructions.push(createAtaIx);
      }

      console.log('🔧 Step 9: Creating transfer instruction...');
      const transferInstruction = createTransferInstruction(
        fromAta, // source (Swig's token account)
        toAta, // destination (recipient's token account)
        swigAddress, // owner (Swig wallet)
        adjustedAmount // amount
      );
      instructions.push(transferInstruction);

      console.log('🔧 Step 10: Creating sign instruction...');
      // Create sign instruction for the Swig
      const signIx = await signInstruction(agentRole, wallet.publicKey, instructions);
      console.log('🔧 Sign instruction created');

      console.log('🔧 Step 11: Building and signing transaction...');
      const transaction = new Transaction().add(signIx);
      transaction.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      console.log('🔧 Latest blockhash:', latestBlockhash.blockhash);

      console.log('🔧 Step 12: Signing transaction...');
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log('🔧 Transaction signed');

      console.log('🔧 Step 13: Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('🔧 Transaction sent, signature:', signature);

      console.log('🔧 Step 14: Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('🔧 Transaction confirmed!');

      const tokenSymbol = mintAddress.toBase58().substring(0, 8) + '...';
      const responseContent = {
        text: `✅ Successfully transferred ${amount} ${tokenSymbol} tokens from Swig wallet!\n\nFrom: ${swigAddress.toBase58()}\nTo: ${recipientAddress.toBase58()}\nToken Mint: ${mintAddress.toBase58()}\nAmount: ${amount} tokens\nTransaction: ${signature}`,
        thought: `Successfully transferred ${amount} SPL tokens from the Swig wallet to ${recipientAddress.toBase58()}.`,
        actions: ['SWIG_TRANSFER_TOKEN_TO_ADDRESS', 'REPLY'],
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
      console.error('🔧 Swig transfer token to address error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to transfer token from Swig wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'The token transfer from Swig wallet failed. This could be due to insufficient token balance, insufficient authority permissions, network issues, or invalid parameters.',
        actions: ['SWIG_TRANSFER_TOKEN_TO_ADDRESS', 'REPLY'],
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
          text: 'Transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU from swig to 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll transfer 100 SPL tokens from your Swig wallet to that address.",
          action: 'SWIG_TRANSFER_TOKEN_TO_ADDRESS',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Send 50 spl tokens EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v from swig to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Using your Swig wallet to send 50 SPL tokens...',
          action: 'SWIG_TRANSFER_TOKEN_TO_ADDRESS',
        },
      },
    ],
  ] as ActionExample[][],
};
