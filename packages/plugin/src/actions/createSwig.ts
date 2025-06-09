import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
  type UUID,
} from '@elizaos/core';
import {
  Actions,
  createEd25519AuthorityInfo,
  fetchNullableSwig,
  findSwigPda,
  Swig,
} from '@swig-wallet/classic';
import { Transaction } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';
import { getSolanaConnection, getSolanaWallet, sendAndConfirmTransaction } from '../utils.js';

export const createSwigAction: Action = {
  name: 'CREATE_SWIG',
  similes: ['CREATE_SWIG_WALLET', 'MAKE_SWIG', 'INITIALIZE_SWIG', 'SETUP_SWIG', 'NEW_SWIG_WALLET'],
  description:
    "Create a new Swig wallet on Solana with an Ed25519 authority type and 'all' actions enabled",

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Must have creation intent, not just mention swig
    const hasCreateWord = /\b(create|make|new|setup|initialize|start|build)\b/.test(text);
    const hasSwigWord = /\bswig\b/.test(text);
    const hasWalletWord = /\b(wallet|account)\b/.test(text);

    // Exclude transfer/send operations
    const hasTransferWord = /\b(transfer|send|fund|deposit)\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);
    const isTransferOperation = hasTransferWord && hasAmountPattern;

    // Must have creation intent + swig mention, but not be a transfer operation
    const isCreateIntent = hasCreateWord && hasSwigWord && !isTransferOperation;

    // Also check for specific keyword patterns for backwards compatibility
    const keywords = [
      'create swig',
      'make swig',
      'new swig',
      'setup swig',
      'initialize swig',
      'start swig',
      'build swig',
    ];

    const hasKeywordMatch = keywords.some((keyword) => text.includes(keyword));

    const result = isCreateIntent || hasKeywordMatch;
    console.log(`🔍 CREATE_SWIG validation: "${text}" -> ${result}`);
    console.log(
      '🔍 Create word:',
      hasCreateWord,
      'Swig word:',
      hasSwigWord,
      'Transfer operation:',
      isTransferOperation,
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
    console.log('🔧 CREATE_SWIG action handler called!');
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

      console.log('🔧 Step 4: Checking if swig already exists...');
      // Check if swig already exists
      const existingSwig = await fetchNullableSwig(connection, swigAddress);
      if (existingSwig) {
        console.log('🔧 Swig already exists, sending existing wallet response');
        const existingContent = {
          text: `Swig wallet already exists at address: ${swigAddress.toBase58()}`,
          thought: 'A Swig wallet already exists for this authority. No need to create a new one.',
          actions: ['CREATE_SWIG', 'REPLY'],
          source: message.content.source,
        };

        // Update the response in the responses array so REPLY action uses our content
        if (responses && responses.length > 0) {
          console.log('🔧 Updating responses array with existing wallet content');
          responses[0].content = existingContent;
        }

        // Send response using callback
        if (callback) {
          console.log('🔧 Calling callback with existing wallet response');
          await callback(existingContent);
          console.log('🔧 Callback completed successfully');
        }

        return true;
      }
      console.log('🔧 No existing swig found, proceeding with creation');

      console.log('🔧 Step 5: Creating swig instruction...');
      // Create the swig
      const createSwigInstruction = Swig.create({
        actions: Actions.set().all().get(),
        authorityInfo: createEd25519AuthorityInfo(wallet.publicKey),
        id: wallet.publicKey.toBytes(),
        payer: wallet.publicKey,
      });
      console.log('🔧 Swig instruction created');

      console.log('🔧 Step 6: Building transaction...');
      const transaction = new Transaction().add(createSwigInstruction);
      transaction.feePayer = wallet.publicKey;

      console.log('🔧 Step 7: Getting latest blockhash...');
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      console.log('🔧 Latest blockhash:', latestBlockhash.blockhash);

      console.log('🔧 Step 8: Signing transaction...');
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log('🔧 Transaction signed');

      console.log('🔧 Step 9: Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('🔧 Transaction sent, signature:', signature);

      console.log('🔧 Step 10: Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('🔧 Transaction confirmed!');

      const responseContent = {
        text: `✅ Swig wallet created successfully!\n\nSwig Address: ${swigAddress.toBase58()}\nTransaction: ${signature}`,
        thought: 'Successfully created a new Swig wallet and confirmed the transaction on-chain.',
        actions: ['CREATE_SWIG', 'REPLY'],
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
      console.error('🔧 Create swig error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to create Swig wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'The Swig wallet creation failed due to an error. This could be due to network issues, insufficient funds, or configuration problems.',
        actions: ['CREATE_SWIG', 'REPLY'],
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
        content: { text: 'Can you create a new swig wallet for me?' },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll create a new Swig wallet for you.",
          action: 'CREATE_SWIG',
        },
      },
    ],
    [
      {
        name: 'User',
        content: { text: 'I need to set up a swig wallet' },
      },
      {
        name: 'Agent',
        content: {
          text: 'Creating a new Swig wallet with your authority...',
          action: 'CREATE_SWIG',
        },
      },
    ],
  ] as ActionExample[][],
};
