# Swig ElizaOS Plugin

Plugin for ElizaOS that enables AI agents to interact with Swig smart wallets on the Solana.

## Architecture

This monorepo contains:

- **`packages/plugin/`** - The main Swig ElizaOS plugin package (`@swig-wallet/plugin-elizaos`)
- **`examples/eliza/`** - A complete ElizaOS workspace with the plugin integrated for testing and examples

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) >= 1.2.15
- Node.js >= 18
- A Solana wallet with SOL
- Access to a Solana RPC endpoint

### Installation

1. Clone the repository:

```bash
git clone https://github.com/anagrambuild/swig-elizaos-plugin
cd swig-elizaos-plugin
```

2. Install dependencies:

```bash
bun install

# Install dependencies for examples:
bun run install:examples
```

1. Build the plugin and examples:

```bash
bun run build
```

## Development Commands

### Building

- `bun run build` - Build both plugin and examples (plugin builds first)
- `bun run build:plugin` - Build only the plugin package
- `bun run build:examples` - Build only the examples workspace

### Running Examples

- `bun run install:examples` - Install dependencies for the ElizaOS example
- `bun run start:examples` - Start the ElizaOS CLI with the Swig plugin
- `bun run clean:examples` - Clean the examples workspace

### Development

- `bun run dev` - Watch mode for plugin development
- `bun run lint` - Lint all packages

### Release Management

- `bun run changeset` - Create a new changeset for versioning
- `bun run changeset:version` - Apply changesets and update versions
- `bun run changeset:publish` - Build and publish packages to npm

## Configuration

### Environment Setup

The plugin requires specific environment configuration to connect to Solana and manage wallets.

**Important**: Create a `.env` file in `examples/eliza/packages/cli/` directory for the environment variables to be picked up properly.

```bash
# examples/eliza/packages/cli/.env

# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
# or for devnet: https://api.devnet.solana.com
# or for local development: http://localhost:8899

## Base58 Encoded Solana Private Key
SOLANA_PRIVATE_KEY=

# Other ElizaOS configuration...
OPENAI_API_KEY=your_openai_api_key
```

### Runtime Secrets

The agent needs access to a Solana wallet through runtime secrets. You must configure:

1. **Private Key**: A base58-encoded Solana private key
2. **RPC Connection**: Solana RPC endpoint URL

These should be set in your agent's runtime configuration or environment.

**Example runtime secrets configuration:**

```json
{
  "SOLANA_PRIVATE_KEY": "your_base58_encoded_private_key_here",
  "SOLANA_RPC_URL": "https://api.devnet.solana.com"
}
```

Or you can configure these through the ElizaOS web ui provided.

## Local Development Setup

For local development and testing, we recommend using the Swig test validator:

### 1. Set Up Test Validator

Clone and run the swig-ts repository test validator:

```bash
git clone https://github.com/swig-wallet/swig-ts
cd swig-ts
bun install
bun run test-validator
```

This starts a local Solana test validator with a compatible version of the Swig program pre-loaded.

### 2. Create and Fund a Test Wallet

Generate a new keypair and airdrop SOL:

```bash
# Generate a new keypair
solana-keygen new --outfile ~/test-wallet.json

# Set the keypair as default
solana config set --keypair ~/test-wallet.json

# Connect to local validator
solana config set --url http://localhost:8899

# Airdrop SOL to your wallet
solana airdrop 10

# Get your private key in base58 format
solana-keygen pubkey ~/test-wallet.json --outfile /dev/stdout
# Then get the private key (you'll need to extract base58 from the JSON using something like https://crates.io/crates/solana-base58-json-converter)
```

### 3. Configure Agent

Use the generated private key in your agent's runtime secrets:

```bash
# In examples/eliza/packages/cli/.env
SOLANA_RPC_URL=http://localhost:8899
SOLANA_PRIVATE_KEY=your_base58_encoded_private_key_from_step_2
```

### 4. Start the Agent

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Start ElizaOS example w/ example UI
bun run start:examples

# ElizaOS and your agent will be accessible from http://localhost:3000 or the port specified in your terminal.
```

## Plugin Features

The Swig ElizaOS plugin provides the following capabilities:

- **Wallet Management**: Create and manage Swig wallets
- **Transaction Signing**: Sign transactions using the configured private key
- **Balance Queries**: Check SOL and SPL token balances
- **Transfer Operations**: Send SOL and SPL tokens

## Plugin Development

### Project Structure

```
packages/plugin/
├── src/
│   ├── actions/          # ElizaOS actions
│   ├── index.ts         # Main plugin export
│   └── ...
├── package.json
└── project.json         # Nx configuration
```

### Building the Plugin

The plugin uses `tsup` for building:

```bash
bun run build:plugin
```

## Examples Structure

The examples directory contains a complete ElizaOS workspace that demonstrates the plugin in action:

```
examples/eliza/
├── packages/
│   ├── cli/             # ElizaOS CLI with Swig plugin
│   ├── core/            # ElizaOS core
│   └── ...
└── package.json         # Workspace configuration
```

The CLI package already includes the Swig plugin as a dependency:

```json
{
  "dependencies": {
    "@swig-wallet/plugin-elizaos": "file:../../../../packages/plugin"
  }
}
```

## Troubleshooting

### Common Issues

1. **Environment variables not loading**: Ensure your `.env` file is in `examples/eliza/packages/cli/`. You can set environment variables at runtime for the agent as well by modifying the agent in the ElizaOS UI or the character definition file.

2. **RPC connection errors**: Verify your `SOLANA_RPC_URL` is correct and accessible

3. **Private key format errors**: Ensure your private key is base58 encoded

4. **Build failures**: Run `bun run clean:examples` and then `bun run build`

### Getting Help

- Check the [ElizaOS documentation](https://elizaos.github.io/eliza/)
- Review the [Swig documentation](https://build.onswig.com/)
- Open an issue in this repository

## Release Process

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated releases via GitHub Actions.

### Creating a Release

1. **Make your changes** and commit them to a feature branch
2. **Create a changeset** describing your changes:

   ```bash
   bun run changeset
   ```

   - Select the packages that have changed (usually just `@swig-wallet/plugin-elizaos`)
   - Choose the appropriate version bump (patch, minor, major)
   - Write a brief description of the changes

3. **Commit the changeset**:

   ```bash
   git add .changeset/
   git commit -m "chore: add changeset for [your changes]"
   ```

4. **Push and create a PR** - the CI will run tests and linting

5. **Merge to main** - GitHub Actions will automatically:
   - Create a "Release PR" that bumps versions and updates CHANGELOG.md
   - When you merge the Release PR, it will publish to npm automatically

### Manual Release (if needed)

```bash
# Create and apply version changes
bun run changeset:version

# Build and publish
bun run changeset:publish
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `bun run lint` and `bun run test`
6. Create a changeset: `bun run changeset`
7. Submit a pull request

## License

AGPL-3.0 License - see LICENSE file for details.
