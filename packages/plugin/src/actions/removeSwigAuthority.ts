import {
  type Action,
  type ActionExample,
  type HandlerCallback,
  type IAgentRuntime,
  type Memory,
  type State,
} from '@elizaos/core';
import { PublicKey, Transaction } from '@solana/web3.js';
import { fetchSwig, findSwigPda, removeAuthorityInstruction } from '@swig-wallet/classic';
import { getSolanaConnection, getSolanaWallet } from '../utils.js';

export const removeSwigAuthorityAction: Action = {
  name: 'REMOVE_SWIG_AUTHORITY',
  similes: ['REMOVE_AUTHORITY_FROM_SWIG', 'REMOVE_SWIG_SIGNER', 'REVOKE_SWIG_ACCESS'],
  description: 'Remove an Ed25519 authority from an existing Swig wallet',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';
    const keywords = ['remove authority', 'remove signer', 'revoke access', 'remove from swig'];

    console.log(
      '🔍 REMOVE_SWIG_AUTHORITY validation:',
      `"${text}" -> ${keywords.some((keyword) => text.includes(keyword))}`
    );
    return keywords.some((keyword) => text.includes(keyword));
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<boolean> => {
    console.log('🔧 REMOVE_SWIG_AUTHORITY action handler called!');
    console.log('🔧 Callback function present:', !!callback);
    console.log('🔧 Message content:', message.content.text);
    console.log('🔧 Responses array length:', responses?.length || 0);

    // Check if authority management is enabled
    const authorityManagementEnabledSetting = runtime.getSetting(
      'SWIG_AUTHORITY_MANAGEMENT_ENABLED'
    );
    const authorityManagementEnabled =
      authorityManagementEnabledSetting === undefined
        ? true
        : String(authorityManagementEnabledSetting) === 'true';

    if (!authorityManagementEnabled) {
      console.log('🔧 Authority management operation blocked - authority management is disabled');
      const errorContent = {
        text: `❌ Authority management operations are currently disabled. Set SWIG_AUTHORITY_MANAGEMENT_ENABLED=true to enable authority management.`,
        thought: 'Authority management operations have been disabled in the plugin configuration.',
        actions: ['REMOVE_SWIG_AUTHORITY', 'REPLY'],
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

      // Extract the authority public key or role ID from the message
      console.log('🔧 Step 4: Parsing authority to remove...');
      const text = message.content.text || '';
      const publicKeyMatch = text.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
      const roleIdMatch = text.match(/role\s*(?:id\s*)?(\d+)/i);

      console.log('🔧 Step 5: Fetching existing Swig wallet...');
      const swig = await fetchSwig(connection, swigAddress);
      const roles = swig.findRolesByEd25519SignerPk(wallet.publicKey);
      console.log('🔧 Found roles for current wallet:', roles.length);

      if (!roles.length) {
        throw new Error(
          'No roles found for your wallet in this Swig. You need to be an existing authority to remove other authorities.'
        );
      }

      const agentRole = roles[0];
      console.log('🔧 Using role:', agentRole);

      let targetAuthorityPubkey: PublicKey;
      let targetRole: any;

      if (roleIdMatch) {
        // Remove by role ID
        const targetRoleId = parseInt(roleIdMatch[1]);
        console.log('🔧 Target role ID:', targetRoleId);

        targetRole = swig.roles.find((role) => role.id === targetRoleId);
        if (!targetRole) {
          throw new Error(`Role ID ${targetRoleId} not found in this Swig wallet.`);
        }

        targetAuthorityPubkey = new PublicKey(targetRole.authority.data);
        console.log('🔧 Target authority pubkey from role:', targetAuthorityPubkey.toBase58());
      } else if (publicKeyMatch) {
        // Remove by public key
        targetAuthorityPubkey = new PublicKey(publicKeyMatch[1]);
        console.log('🔧 Target authority pubkey:', targetAuthorityPubkey.toBase58());

        targetRole = swig.roles.find((role) =>
          new PublicKey(role.authority.data).equals(targetAuthorityPubkey)
        );

        if (!targetRole) {
          throw new Error(
            `Authority ${targetAuthorityPubkey.toBase58()} is not found in this Swig wallet.`
          );
        }

        console.log('🔧 Found target role ID:', targetRole.id);
      } else {
        throw new Error(
          "Please provide either a valid public key or role ID to remove (e.g., 'remove authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms' or 'remove role 1')"
        );
      }

      // Prevent removing the last authority
      if (swig.roles.length <= 1) {
        throw new Error('Cannot remove the last authority from the Swig wallet.');
      }

      // Prevent self-removal (optional safety check)
      if (targetAuthorityPubkey.equals(wallet.publicKey)) {
        throw new Error(
          'Cannot remove your own authority. Use another authority to remove this one.'
        );
      }

      console.log('🔧 Step 6: Creating remove authority instruction...');
      // Create remove authority instruction
      const removeAuthorityIx = await removeAuthorityInstruction(
        agentRole,
        wallet.publicKey,
        targetRole
      );
      console.log('🔧 Remove authority instruction created');

      console.log('🔧 Step 7: Building and signing transaction...');
      const transaction = new Transaction().add(removeAuthorityIx);
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
        text: `✅ Successfully removed authority from Swig wallet!\n\nRemoved Authority: ${targetAuthorityPubkey.toBase58()}\nRole ID: ${
          targetRole.id
        }\nSwig Address: ${swigAddress.toBase58()}\nTransaction: ${signature}`,
        thought: 'Successfully removed an authority from the Swig wallet.',
        actions: ['REMOVE_SWIG_AUTHORITY', 'REPLY'],
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
      console.error('🔧 Remove swig authority error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to remove authority from Swig wallet: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        thought:
          'Failed to remove the authority from the Swig wallet. This could be due to insufficient permissions, network issues, or invalid parameters.',
        actions: ['REMOVE_SWIG_AUTHORITY', 'REPLY'],
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
          text: 'Remove authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms from my swig wallet',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll remove that public key as an authority from your Swig wallet.",
          action: 'REMOVE_SWIG_AUTHORITY',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Revoke access for role 2',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Removing role 2 from the Swig wallet...',
          action: 'REMOVE_SWIG_AUTHORITY',
        },
      },
    ],
  ] as ActionExample[][],
};
