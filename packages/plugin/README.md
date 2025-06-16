# @swig-wallet/plugin-elizaos

A Swig smart wallet plugin for ElizaOS that enables agents to create and manage Swig wallets on Solana.

## Overview

The Swig plugin provides ElizaOS agents with the ability to:

- Create new Swig wallets
- Transfer SOL and SPL tokens to/from Swig wallets
- Check Swig wallet balances
- Manage Swig wallet authorities
- Transfer between Swig authorities

## Installation

```bash
npm install @swig-wallet/plugin-elizaos
```

## Configuration

Add the plugin to your ElizaOS character configuration:

```typescript
import { swigPlugin } from '@swig-wallet/plugin-elizaos';

export default {
  name: 'MyAgent',
  plugins: [swigPlugin],
  // ... other config
};
```

### Required Settings

Set these environment variables or add them to your character's settings:

- `SOLANA_PRIVATE_KEY`: Your Solana wallet private key (as JSON array or base58 string)
- `SOLANA_RPC_URL`: Solana RPC endpoint (optional, defaults to mainnet)

### Optional Settings

Configure plugin behavior with these optional settings:

- `SWIG_TRANSFERS_ENABLED`: Enable/disable all transfer functionality (default: `true`)
- `SWIG_AUTHORITY_MANAGEMENT_ENABLED`: Enable/disable authority management functionality (default: `true`)

#### Transfer Control

You can disable all transfer functionality by setting:

```bash
SWIG_TRANSFERS_ENABLED=false
```

When transfers are disabled, the agent will only have access to:

- Creating Swig wallets
- Checking Swig wallet balances (SOL and SPL tokens)
- Viewing Swig wallet authorities
- Querying wallet information

Transfer actions (sending SOL/tokens to/from Swig wallets) will not be available.

#### Authority Management Control

You can disable authority management functionality by setting:

```bash
SWIG_AUTHORITY_MANAGEMENT_ENABLED=false
```

When authority management is disabled, the agent will not have access to:

- Adding new authorities to Swig wallets
- Removing authorities from Swig wallets

The agent can still view existing authorities but cannot modify them.

#### Environment Variables

```bash
# Required
SOLANA_PRIVATE_KEY='your_base58_private_key'

# Optional
SOLANA_RPC_URL='https://api.mainnet-beta.solana.com'
SWIG_TRANSFERS_ENABLED='true'  # Set to 'false' to disable transfers
SWIG_AUTHORITY_MANAGEMENT_ENABLED='true'  # Set to 'false' to disable authority management
```

#### Character Settings

```json
{
  "name": "SwigAgent",
  "plugins": ["@swig-wallet/plugin-elizaos"],
  "settings": {
    "secrets": {
      "SOLANA_PRIVATE_KEY": "abc123...",
      "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
      "SWIG_TRANSFERS_ENABLED": "true",
      "SWIG_AUTHORITY_MANAGEMENT_ENABLED": "true"
    }
  }
}
```

## Actions

### CREATE_SWIG

Create a new Swig wallet.

**Triggers:**

- "create swig"
- "make swig"
- "new swig"
- "setup swig"
- "initialize swig"
- "start swig"
- "build swig"

**Example:**

```
User: "Can you create a new swig wallet for me?"
Agent: "I'll create a new Swig wallet for you."
```

### TRANSFER_TO_SWIG

Transfer SOL from the agent wallet to the Swig wallet.

**Triggers:**

- "transfer to swig"
- "send to swig"
- "fund swig"
- "deposit to swig"
- "transfer funds to swig"

**Examples:**

```
User: "Transfer 1.5 SOL to my swig wallet"
Agent: "I'll transfer 1.5 SOL to your Swig wallet."

User: "Fund the swig with 0.1 SOL"
Agent: "Transferring 0.1 SOL to your Swig wallet..."
```

### TRANSFER_TOKEN_TO_SWIG

Transfer SPL tokens from the agent wallet to the Swig wallet.

**Triggers:**

- "transfer token to swig"
- "send token to swig"
- "transfer spl to swig"
- "send spl to swig"
- "fund swig with token"
- "deposit token to swig"

**Examples:**

```
User: "Transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU to swig"
Agent: "I'll transfer 100 SPL tokens to your Swig wallet."

User: "Send 50 spl tokens EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v to my swig"
Agent: "Transferring 50 SPL tokens to your Swig wallet..."
```

### GET_SWIG_BALANCE

Check the SOL balance of the Swig wallet.

**Triggers:**

- "swig balance"
- "check swig"
- "balance of swig"
- "how much in swig"
- "swig wallet balance"

**Example:**

```
User: "What's the balance of my swig wallet?"
Agent: "I'll check your Swig wallet balance."
```

### GET_SWIG_TOKEN_BALANCE

Check the balance of a specific SPL token in the Swig wallet.

**Triggers:**

- "swig token balance"
- "swig spl balance"
- "token balance in swig"
- "spl balance in swig"
- "check swig token balance"
- "get swig token balance"
- "show swig token balance"

**Examples:**

```
User: "Get swig token balance for 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
Agent: "I'll check the token balance in your Swig wallet."

User: "What is my swig balance of token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
Agent: "Checking your Swig SPL token balance..."
```

### ADD_SWIG_AUTHORITY

Add an Ed25519 authority to an existing Swig wallet.

**Triggers:**

- "add authority"
- "add signer"
- "grant access"
- "add to swig"

**Examples:**

```
User: "Add authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms to my swig wallet"
Agent: "I'll add that public key as a new authority to your Swig wallet."

User: "Grant access to my team member's wallet 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
Agent: "Adding your team member as an authority to the Swig wallet..."
```

### GET_SWIG_AUTHORITIES

Get all authorities (signers) on the Swig wallet.

**Triggers:**

- "swig authorities"
- "authorities on swig"
- "swig signers"
- "signers on swig"
- "who can sign"
- "list authorities"
- "show authorities"
- "get authorities"

**Examples:**

```
User: "Who are the authorities on my swig wallet?"
Agent: "I'll check the authorities on your Swig wallet."

User: "List swig signers"
Agent: "Getting the list of signers for your Swig wallet..."
```

### SWIG_TRANSFER_TO_ADDRESS

Transfer SOL from the Swig wallet to any address.

**Triggers:**

- "transfer from swig"
- "send from swig"
- "transfer using swig"
- "send using swig"
- "swig transfer to"
- "swig send to"
- "use swig to transfer"
- "use swig to send"

**Examples:**

```
User: "Transfer 1.5 SOL from swig to 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms"
Agent: "I'll transfer 1.5 SOL from your Swig wallet to that address."

User: "Send 0.1 SOL using swig to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
Agent: "Using your Swig wallet to send 0.1 SOL..."
```

### SWIG_TRANSFER_TO_AUTHORITY

Transfer SOL from the Swig wallet to another authority on the same Swig.

**Triggers:**

- "transfer from swig to authority"
- "send from swig to authority"
- "transfer to swig authority"
- "send to swig authority"
- "swig transfer to authority"
- "swig send to authority"

**Examples:**

```
User: "Transfer 0.5 SOL from swig to authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms"
Agent: "I'll transfer 0.5 SOL from your Swig wallet to that authority."

User: "Send 1.0 SOL from swig to role 1"
Agent: "Transferring 1.0 SOL from Swig to role 1..."
```

### SWIG_TRANSFER_TOKEN_TO_ADDRESS

Transfer SPL tokens from the Swig wallet to any address.

**Triggers:**

- "transfer token from swig"
- "send token from swig"
- "transfer spl from swig"
- "send spl from swig"
- "swig transfer token to"
- "swig send token to"
- "use swig to transfer token"
- "use swig to send token"

**Examples:**

```
User: "Transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU from swig to 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms"
Agent: "I'll transfer 100 SPL tokens from your Swig wallet to that address."

User: "Send 50 spl tokens EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v from swig to 9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
Agent: "Using your Swig wallet to send 50 SPL tokens..."
```

### SWIG_TRANSFER_TOKEN_TO_AUTHORITY

Transfer SPL tokens from the Swig wallet to another authority on the same Swig.

**Triggers:**

- "transfer token from swig to authority"
- "send token from swig to authority"
- "transfer spl from swig to authority"
- "send spl from swig to authority"
- "transfer token to swig authority"
- "send token to swig authority"
- "swig transfer token to authority"
- "swig send token to authority"

**Examples:**

```
User: "Transfer 100 tokens mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU from swig to authority 2dr69TRDpT6LNec6XSuLSAyyxcjGiivn7T7MgL1udtms"
Agent: "I'll transfer 100 SPL tokens from your Swig wallet to that authority."

User: "Send 50 spl tokens EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v from swig to role 1"
Agent: "Transferring 50 SPL tokens from Swig to role 1..."
```

## Development

### Building

```bash
bun run build
```

### Testing

```bash
bun test
```

### Linting

```bash
bun run lint
```

## Features

- ✅ Create Swig multisig wallets
- ✅ Transfer SOL to/from Swig wallets
- ✅ Transfer SPL tokens to/from Swig wallets
- ✅ Check Swig wallet balances (SOL and SPL tokens)
- ✅ Add authorities to Swig wallets
- ✅ Get list of Swig wallet authorities
- ✅ Transfer between Swig authorities
- ✅ Transfer to external addresses from Swig
- ✅ Manage Swig permissions and roles

## Dependencies

- `@solana/web3.js` - Solana JavaScript SDK
- `@solana/spl-token` - SPL Token support
- `@swig-wallet/classic` - Swig wallet SDK
- `@elizaos/core` - ElizaOS core functionality

## License

AGPL-3.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
