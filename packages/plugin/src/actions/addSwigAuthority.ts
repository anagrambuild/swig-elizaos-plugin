import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
  Actions,
  addAuthorityInstruction,
  createEd25519AuthorityInfo,
  fetchSwig,
  findSwigPda,
} from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const addSwigAuthorityAction: Action = {
  name: 'ADD_SWIG_AUTHORITY',
  similes: ['ADD_AUTHORITY_TO_SWIG', 'ADD_SWIG_SIGNER', 'GRANT_SWIG_ACCESS'],
  description: 'Add an Ed25519 authority to an existing Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    const keywords = ['add authority', 'add signer', 'grant access', 'add to swig'];

    console.log(
      '🔍 ADD_SWIG_AUTHORITY validation:',
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
    console.log('🔧 ADD_SWIG_AUTHORITY action handler called!');
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

      // Extract the authority public key from the message
      console.log('🔧 Step 4: Parsing authority public key...');
      const text = message.content.text || '';
      const publicKeyMatch = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);

      if (!publicKeyMatch) {
        throw new Error(
          "Please provide a valid public key for the new authority (e.g., 'add authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms')"
        );
      }

      const authorityPubkey = new PublicKey(publicKeyMatch[1]);
      console.log('🔧 New authority pubkey:', authorityPubkey.toBase58());

      console.log('🔧 Step 5: Fetching existing Swig wallet...');
      // Fetch the existing Swig wallet
      const swig = await fetchSwig(connection, swigAddress);
      const roles = swig.findRolesByEd25519SignerPk(wallet.publicKey);
      console.log('🔧 Found roles for current wallet:', roles.length);

      if (!roles.length) {
        throw new Error(
          'No roles found for your wallet in this Swig. You need to be an existing authority to add new ones.'
        );
      }

      const agentRole = roles[0];
      console.log('🔧 Using role:', agentRole);

      console.log('🔧 Step 6: Creating add authority instruction...');
      // Create add authority instruction
      const addAuthorityIx = await addAuthorityInstruction(
        agentRole,
        wallet.publicKey,
        createEd25519AuthorityInfo(authorityPubkey),
        Actions.set().all().get()
      );
      console.log('🔧 Add authority instruction created');

      console.log('🔧 Step 7: Building and signing transaction...');
      const transaction = new Transaction().add(addAuthorityIx);
      transaction.feePayer = wallet.publicKey;
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
        text: `✅ Successfully added authority to Swig wallet!\n\nNew Authority: ${authorityPubkey.toBase58()}\nSwig Address: ${swigAddress.toBase58()}\nTransaction: ${signature}`,
        thought: 'Successfully added a new authority to the Swig wallet.',
        actions: ['ADD_SWIG_AUTHORITY', 'REPLY'],
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
      console.error('🔧 Add swig authority error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to add authority to Swig wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        thought:
          'Failed to add the new authority to the Swig wallet. This could be due to insufficient permissions, network issues, or invalid parameters.',
        actions: ['ADD_SWIG_AUTHORITY', 'REPLY'],
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
          text: 'Add authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms to my swig wallet',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll add that public key as a new authority to your Swig wallet.",
          action: 'ADD_SWIG_AUTHORITY',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: "Grant access to my team member's wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Adding your team member as an authority to the Swig wallet...',
          action: 'ADD_SWIG_AUTHORITY',
        },
      },
    ],
  ] as ActionExample[][],
};
