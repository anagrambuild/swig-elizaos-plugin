import { type Plugin } from '@elizaos/core';
import { createSwigAction } from './actions/createSwig.js';
import { transferToSwigAction } from './actions/transferToSwig.js';
import { getSwigBalanceAction } from './actions/getSwigBalance.js';
import { addSwigAuthorityAction } from './actions/addSwigAuthority.js';
import { getSwigAuthoritiesAction } from './actions/getSwigAuthorities.js';
import { swigTransferToAddressAction } from './actions/swigTransferToAddress.js';
import { transferTokenToSwigAction } from './actions/transferTokenToSwig.js';
import { swigTransferToAuthorityAction } from './actions/swigTransferToAuthority.js';
import { swigTransferTokenToAddressAction } from './actions/swigTransferTokenToAddress.js';
import { swigTransferTokenToAuthorityAction } from './actions/swigTransferTokenToAuthority.js';
import { getSwigTokenBalanceAction } from './actions/getSwigTokenBalance.js';

export const swigPlugin: Plugin = {
  name: 'swig',
  description: 'Swig smart wallet plugin for Solana - create and manage Swig wallets.',

  actions: [
    createSwigAction,
    transferToSwigAction,
    getSwigBalanceAction,
    addSwigAuthorityAction,
    getSwigAuthoritiesAction,
    swigTransferToAddressAction,
    transferTokenToSwigAction,
    swigTransferToAuthorityAction,
    swigTransferTokenToAddressAction,
    swigTransferTokenToAuthorityAction,
    getSwigTokenBalanceAction,
  ],

  // Plugin initialization (optional)
  init: async (config, runtime) => {
    console.log('🔌 Initializing Swig plugin...');
    console.log(
      '🔌 Plugin actions:',
      swigPlugin.actions?.map((a) => a.name)
    );

    // Validate required settings
    const privateKey = runtime.getSetting('SOLANA_PRIVATE_KEY');
    if (!privateKey) {
      console.warn('SOLANA_PRIVATE_KEY not found. Swig plugin functionality will be limited.');
      console.warn('Please set SOLANA_PRIVATE_KEY in your runtime settings to use Swig features.');
    }

    const rpcUrl = runtime.getSetting('SOLANA_RPC_URL');
    if (!rpcUrl) {
      console.info('SOLANA_RPC_URL not set, using default Solana mainnet RPC.');
    }

    console.log('🔌 Swig plugin initialized successfully!');
  },
};

// Export all actions for individual import if needed
export * from './actions/createSwig.js';
export * from './actions/transferToSwig.js';
export * from './actions/getSwigBalance.js';
export * from './actions/addSwigAuthority.js';
export * from './actions/getSwigAuthorities.js';
export * from './actions/swigTransferToAddress.js';
export * from './actions/transferTokenToSwig.js';
export * from './actions/swigTransferToAuthority.js';
export * from './actions/swigTransferTokenToAddress.js';
export * from './actions/swigTransferTokenToAuthority.js';
export * from './actions/getSwigTokenBalance.js';
export * from './types.js';
export * from './utils.js';

export default swigPlugin;
