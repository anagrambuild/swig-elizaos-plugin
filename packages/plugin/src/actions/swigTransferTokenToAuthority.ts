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

export const swigTransferTokenToAuthorityAction: Action = {
  name: 'SWIG_TRANSFER_TOKEN_TO_AUTHORITY',
  similes: [
    'SWIG_SEND_TOKEN_TO_AUTHORITY',
    'TRANSFER_TOKEN_FROM_SWIG_TO_AUTHORITY',
    'SEND_TOKEN_FROM_SWIG_TO_AUTHORITY',
    'SWIG_TRANSFER_SPL_TO_AUTHORITY',
  ],
  description: 'Transfer SPL tokens from the Swig wallet to another authority on the same Swig',

  validate: async (runtime: IAgentRuntime, message: Memory, state?: State) => {
    const text = message.content.text?.toLowerCase() || '';

    // Check for swig token transfer to authority patterns
    const hasSwigWord = /\bswig\b/.test(text);
    const hasTransferWord = /\b(transfer|send|pay)\b/.test(text);
    const hasTokenWord = /\b(token|spl|mint)\b/.test(text);
    const hasAuthorityWord = /\b(authority|signer|role)\b/.test(text);
    const hasAmountPattern = /\d+(?:\.\d+)?/.test(text);

    // Must have swig + transfer + token + authority + amount
    const isSwigTokenTransferToAuthority =
      hasSwigWord && hasTransferWord && hasTokenWord && hasAuthorityWord && hasAmountPattern;

    // Also check for specific keyword patterns
    const keywords = [
      'transfer token from swig to authority',
      'send token from swig to authority',
      'transfer spl from swig to authority',
      'send spl from swig to authority',
      'transfer token to swig authority',
      'send token to swig authority',
      'transfer.*token.*from.*swig.*to.*authority',
      'send.*token.*from.*swig.*to.*authority',
      'swig transfer token to authority',
      'swig send token to authority',
      'use swig to transfer token to authority',
    ];

    const hasKeywordMatch = keywords.some((keyword) => {
      if (keyword.includes('.*')) {
        const regex = new RegExp(keyword);
        return regex.test(text);
      } else {
        return text.includes(keyword);
      }
    });

    const result = isSwigTokenTransferToAuthority || hasKeywordMatch;
    console.log('🔍 SWIG_TRANSFER_TOKEN_TO_AUTHORITY validation:', `"${text}" -> ${result}`);
    console.log(
      '🔍 Swig word:',
      hasSwigWord,
      'Transfer word:',
      hasTransferWord,
      'Token word:',
      hasTokenWord,
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
    _state?: State,
    _options?: any,
    callback?: HandlerCallback,
    responses?: Memory[]
  ): Promise<boolean> => {
    console.log('🔧 SWIG_TRANSFER_TOKEN_TO_AUTHORITY action handler called!');
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
        actions: ['SWIG_TRANSFER_TOKEN_TO_AUTHORITY', 'REPLY'],
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
      const addresses = text.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [];
      const roleIdMatch = text.match(/role\s*(?:id\s*)?(\d+)/i);

      if (!amountMatch) {
        throw new Error(
          "Please specify an amount to transfer (e.g., 'transfer 100 tokens mint 4zMMC9... from swig to authority 2dr69...' or 'transfer 100 tokens mint 4zMMC9... from swig to role 1')"
        );
      }

      const amount = parseFloat(amountMatch[1]);
      console.log('🔧 Transfer amount:', amount);

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

      console.log('🔧 Step 6: Parsing mint and recipient authority...');
      let mintAddress: PublicKey;
      let recipientAddress: PublicKey;

      // Extract mint address
      const mintMatch = text.match(/mint\s+([1-9A-HJ-NP-Za-km-z]{32,44})/i);
      if (!mintMatch || !mintMatch[1]) {
        throw new Error(
          "Please specify the token mint address (e.g., 'mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')"
        );
      }
      mintAddress = new PublicKey(mintMatch[1]);
      console.log('🔧 Mint address:', mintAddress.toBase58());

      // Find recipient authority
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
      } else {
        // Look for authority address after "to"
        const authorityMatch = text.match(/to\s+(?:authority\s+)?([1-9A-HJ-NP-Za-km-z]{32,44})/i);
        if (!authorityMatch || !authorityMatch[1]) {
          throw new Error(
            "Please specify either a role ID (e.g., 'role 1') or an authority address (e.g., 'to authority 2dr69...')"
          );
        }

        recipientAddress = new PublicKey(authorityMatch[1]);
        console.log('🔧 Checking if address is authority:', recipientAddress.toBase58());

        const isAuthority = swig.roles.some((role) =>
          new PublicKey(role.authority.data).equals(recipientAddress)
        );

        if (!isAuthority) {
          throw new Error(
            `Address ${recipientAddress.toBase58()} is not an authority on this Swig wallet.`
          );
        }
      }

      console.log('🔧 Recipient authority address:', recipientAddress.toBase58());

      console.log('🔧 Step 7: Getting mint info...');
      const mintInfo = await getMint(connection, mintAddress);
      const adjustedAmount = amount * Math.pow(10, mintInfo.decimals);
      console.log('🔧 Token decimals:', mintInfo.decimals);
      console.log('🔧 Adjusted amount:', adjustedAmount);

      console.log('🔧 Step 8: Getting token accounts...');
      const fromAta = await getAssociatedTokenAddress(mintAddress, swigAddress, true);
      const toAta = await getAssociatedTokenAddress(mintAddress, recipientAddress, false);
      console.log('🔧 From ATA (Swig):', fromAta.toBase58());
      console.log('🔧 To ATA (Authority):', toAta.toBase58());

      console.log('🔧 Step 9: Building transaction...');
      const instructions = [];

      // Check if the recipient's token account exists
      let toAccountExists = false;
      try {
        await getAccount(connection, toAta);
        toAccountExists = true;
        console.log('🔧 Authority token account exists');
      } catch (error) {
        console.log('🔧 Authority token account does not exist, will create it');
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

      console.log('🔧 Step 10: Creating transfer instruction...');
      const transferInstruction = createTransferInstruction(
        fromAta, // source (Swig's token account)
        toAta, // destination (authority's token account)
        swigAddress, // owner (Swig wallet)
        adjustedAmount // amount
      );
      instructions.push(transferInstruction);

      console.log('🔧 Step 11: Creating sign instruction...');
      // Create sign instruction for the Swig
      const signIx = await signInstruction(agentRole, wallet.publicKey, instructions);
      console.log('🔧 Sign instruction created');

      console.log('🔧 Step 12: Building and signing transaction...');
      const transaction = new Transaction().add(signIx);
      transaction.feePayer = wallet.publicKey;
      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      console.log('🔧 Latest blockhash:', latestBlockhash.blockhash);

      console.log('🔧 Step 13: Signing transaction...');
      const signedTransaction = await wallet.signTransaction(transaction);
      console.log('🔧 Transaction signed');

      console.log('🔧 Step 14: Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      console.log('🔧 Transaction sent, signature:', signature);

      console.log('🔧 Step 15: Confirming transaction...');
      await connection.confirmTransaction(signature, 'confirmed');
      console.log('🔧 Transaction confirmed!');

      const tokenSymbol = mintAddress.toBase58().substring(0, 8) + '...';
      const responseContent = {
        text: `✅ Successfully transferred ${amount} ${tokenSymbol} tokens from Swig wallet to authority!\n\nFrom: ${swigAddress.toBase58()}\nTo Authority: ${recipientAddress.toBase58()}\nToken Mint: ${mintAddress.toBase58()}\nAmount: ${amount} tokens\nTransaction: ${signature}`,
        thought: `Successfully transferred ${amount} SPL tokens from the Swig wallet to authority ${recipientAddress.toBase58()}.`,
        actions: ['SWIG_TRANSFER_TOKEN_TO_AUTHORITY', 'REPLY'],
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
      console.error('🔧 Swig transfer token to authority error:', error);
      console.error('🔧 Error stack:', error instanceof Error ? error.stack : 'No stack trace');

      const errorContent = {
        text: `❌ Failed to transfer token from Swig wallet to authority: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
        thought:
          'The token transfer from Swig wallet to authority failed. This could be due to insufficient token balance, invalid authority, insufficient permissions, or network issues.',
        actions: ['SWIG_TRANSFER_TOKEN_TO_AUTHORITY', 'REPLY'],
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
          text: 'Transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU from swig to authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms',
        },
      },
      {
        name: 'Agent',
        content: {
          text: "I'll transfer 100 SPL tokens from your Swig wallet to that authority.",
          action: 'SWIG_TRANSFER_TOKEN_TO_AUTHORITY',
        },
      },
    ],
    [
      {
        name: 'User',
        content: {
          text: 'Send 50 spl tokens EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v from swig to role 1',
        },
      },
      {
        name: 'Agent',
        content: {
          text: 'Transferring 50 SPL tokens from Swig to role 1...',
          action: 'SWIG_TRANSFER_TOKEN_TO_AUTHORITY',
        },
      },
    ],
  ] as ActionExample[][],
};
