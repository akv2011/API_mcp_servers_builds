# Model Context Protocol (MCP) Documentation

## Overview

This MCP server exposes DeFi data and unsigned transaction builders across Aave V3, Morpho, Hyperliquid and several EVM chains as MCP tools. Every tool is read-only: the `generate_*` tools return transaction data for the user's wallet to sign and never send anything.

## Getting Started

### Access

You need:
- The server URL, for example `http://localhost:3000/mcp` (Streamable HTTP; legacy SSE is at `/sse`)
- An API key, sent as `Authorization: Bearer <key>`. Locally that is the `MCP_API_KEY` you started the server with; in a hosted setup it is a key from the `api_keys` table.

### Basic Usage

With the official TypeScript SDK (`npm install @modelcontextprotocol/sdk`):

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_API_KEY}` } },
});
const client = new Client({ name: 'example', version: '1.0.0' });
await client.connect(transport);

const result = await client.callTool({ name: 'get_token_info', arguments: { query: 'ETH' } });
if (result.isError) throw new Error(result.content[0].text);
console.log(JSON.parse(result.content[0].text));
```

Failed calls set `isError: true` on the result, so check it before parsing.

## Available Tools

Generated from the server's `tools/list`. Every tool carries `readOnlyHint: true`; `generate_*` tools return unsigned transaction data.

### generate_aave_borrow_tx

Generates the transaction data required to borrow assets from an Aave V3 pool. Requires sufficient collateral in the pool. Does NOT send the transaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `mainnet-etherfi` \| `mainnet-lido` \| `arbitrum` \| `optimism` \| `base` … | yes | The chain to borrow the token from |
| `asset` | string | yes | The token symbol to borrow (e.g., WETH, USDC) |
| `amount` | number | yes | The amount of tokens to borrow |
| `on_behalf_of` | string | yes | The address to borrow the tokens on behalf of |

### generate_aave_repay_tx

Generates the transaction data required to repay borrowed assets to an Aave V3 pool. Does NOT send the transaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `mainnet-etherfi` \| `mainnet-lido` \| `arbitrum` \| `optimism` \| `base` … | yes | The chain to repay the token to |
| `asset` | string | yes | The token symbol to repay (e.g., WETH, USDC) |
| `amount` | number | yes | The amount of tokens to repay |
| `on_behalf_of` | string | yes | The address to repay the tokens on behalf of |

### generate_aave_supply_tx

Generates the transaction data required to supply assets to an Aave V3 pool. Does NOT send the transaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `mainnet-etherfi` \| `mainnet-lido` \| `arbitrum` \| `optimism` \| `base` … | yes | The chain to supply the token to |
| `asset` | string | yes | The token symbol to supply (e.g., WETH, USDC) |
| `amount` | number | yes | The amount of tokens to supply |
| `on_behalf_of` | string | yes | The address to supply the tokens on behalf of |

### generate_aave_withdraw_tx

Generates the transaction data required to withdraw assets from an Aave V3 pool. Does NOT send the transaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `mainnet-etherfi` \| `mainnet-lido` \| `arbitrum` \| `optimism` \| `base` … | yes | The chain to withdraw the token from |
| `asset` | string | yes | The token symbol to withdraw (e.g., WETH, USDC) |
| `amount` | number | yes | The amount of tokens to withdraw |
| `on_behalf_of` | string | yes | The address to withdraw the tokens to |

### generate_morpho_borrow_tx

Borrow assets from Morpho Blue by supplying collateral. Returns unsigned transaction data for the wallet to sign; nothing is sent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `base` | yes | The blockchain network to use |
| `supply_asset` | string | yes | The token symbol to supply as collateral (e.g., "WETH", "wstETH") |
| `supply_amount` | number | yes | The amount of collateral to supply |
| `borrow_asset` | string | yes | The token symbol to borrow (e.g., "USDC", "DAI") |
| `borrow_amount` | number | yes | The amount to borrow |
| `user_address` | string | yes | The user address to borrow on behalf of |

### generate_morpho_vault_deposit_tx

Deposit assets into a Morpho Earn Vault. Returns unsigned transaction data for the wallet to sign; nothing is sent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `base` | yes | The blockchain network |
| `asset_symbol` | string | yes | The asset symbol to deposit (e.g., "WETH", "USDC") |
| `amount` | number | yes | The amount to deposit |
| `user_address` | string | yes | The user address to deposit on behalf of |
| `vault_identifier` | string | no | Optional: Vault address or descriptive name |

### generate_morpho_vault_withdraw_tx

Withdraw assets from a Morpho Earn Vault. Returns unsigned transaction data for the wallet to sign; nothing is sent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `mainnet` \| `base` | yes | The blockchain network |
| `asset_symbol` | string | yes | The asset symbol to withdraw (e.g., "WETH", "USDC") |
| `amount` | number | yes | The amount of shares to withdraw |
| `user_address` | string | yes | The user address to withdraw on behalf of |
| `vault_identifier` | string | no | Optional: Vault address or descriptive name |

### generate_token_approval_tx

Generates the necessary transaction data (like data, to, value) required to approve an ERC20 token for spending by another address (the spender). This is often needed before interacting with DeFi protocols (e.g., supplying liquidity, swapping tokens). Does NOT send the transaction.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `base` \| `mode` \| `mainnet` \| `mainnet-gho` \| `mainnet-etherfi` \| `mainnet-lido` … | yes | The chain where the token exists (e.g., optimism, base) |
| `owner` | string | yes | The address of the token owner initiating the approval |
| `tokenIdentifier` | string | yes | The symbol or contract address of the token to approve (e.g., USDC) |
| `spender` | string | yes | The address of the contract/wallet to grant approval to |
| `amount` | string | yes | The human-readable amount to approve (e.g., '100.5') |

### get_hyperliquid_open_orders

Get open orders for a user on Hyperliquid

| Parameter | Type | Required | Description |
|---|---|---|---|
| `user` | string | yes | User wallet address to fetch open orders for |

### get_hyperliquid_positions

Retrieves the full clearinghouse state (positions and margin) for a given address on Hyperliquid

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | string | yes | Ethereum address to fetch positions for |

### get_lending_markets

Get all lending markets with optional filtering by chain, protocol, and token symbols

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | `base` \| `mode` \| `mainnet` \| `mainnet-gho` \| `mainnet-etherfi` \| `mainnet-lido` … | no | Filter by chain |
| `protocol` | `morpho` \| `aave` | no | Filter by protocol |
| `asset` | string | no | Token symbol to search for |
| `limit` | number | no | Limit the number of results |
| `sort_by` | `supply_apy` \| `borrow_apy` | no | Sort results by APY |

### get_lending_positions

Get user lending positions across all chains or for a specific chain. Returns user positions filtered by optional chain and protocol parameters. - If chain is specified, returns positions for that chain only - If protocol is specified, returns positions for that protocol only - If neither is specified, returns all positions across all chains - Empty positions and chains with no positions are filtered out

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | string | yes | Ethereum address to get positions for (e.g. 0x1155b614971f16758C92c4890eD338C9e3ede6b7) |
| `protocol` | `morpho` \| `aave` | no | Filter positions by protocol |
| `chain` | `base` \| `mode` \| `mainnet` \| `mainnet-gho` \| `mainnet-etherfi` \| `mainnet-lido` … | no | Filter positions by chain |

### get_token_balances

Get the balances of specific tokens on specific chains for a given wallet address.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wallet_address` | string | yes | The wallet address to check the balances for |
| `tokens` | array of object | yes | Array of tokens to check balances for |

### get_token_info

Get token data (like name, symbol, address on different chains, price, market cap) by its symbol, name, or a specific contract address (case insensitive).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Token symbol, name, or contract address to search for |
| `type` | `symbol` \| `name` \| `address` | no | Type of search to perform. Options are "symbol", "name", or "address". If not provided, will auto-detect based on query |
| `historical_days` | integer | no | Number of past days to fetch historical price data for (e.g., 7, 30) |

### get_wallet_balance

Get all known token balances for a wallet across all supported chains.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `wallet_address` | string | yes | The wallet address to check balances for |

### get_yield_opportunities

Get yield opportunities across protocols

| Parameter | Type | Required | Description |
|---|---|---|---|
| `chain` | string | no | Filter opportunities by blockchain network (e.g., "mainnet", "base") |
| `asset` | string | no | Filter opportunities by underlying asset symbol (e.g., "USDC") |
| `protocol` | string | no | Filter opportunities by protocol (aave or morpho) |
| `min_apy` | number | no | Minimum Annual Percentage Yield (APY) filter |
| `limit` | number | no | Maximum number of opportunities to return. If not specified, returns all results. |

## Supported Chains

The MCP supports the following chains:
- Ethereum Mainnet (`mainnet`)
- Arbitrum (`arbitrum`)
- Optimism (`optimism`)
- Base (`base`)
- Sonic (`sonic`)

## Supported Protocols

The MCP supports the following protocols:
- Aave
- Morpho
- Hyperliquid (for perpetual trading) 

## Implementation Details & Security

### Protocol Integration Architecture

Our Model Context Protocol (MCP) serves as a middleware layer between your application and blockchain protocols, without taking custody of user funds at any point. Here's how we've implemented integrations with Aave and Morpho:

#### Aave Integration

We've integrated with Aave v3 using their official SDK, providing:

- **Working Features**:
  - Supply/withdraw assets on all supported chains
  - Borrow/repay functionality with variable rates
  - Real-time market information including APYs, TVL, and available liquidity
  - Full position tracking including health factors and liquidation thresholds

- **Implementation Method**:
  - Direct integration with Aave's smart contracts
  - Transaction construction using the Aave SDK 
  - Health factor calculations and risk assessment

#### Morpho Integration

Morpho integration is more complex due to its unique optimized lending markets:

- **Working Features**:
  - Morpho Blue borrowing with collateral
  - Morpho Earn vault deposits and withdrawals
  - Market discovery across supported chains
  - Yield opportunities aggregation

- **Implementation Method**: 
  - Integration with Morpho's GraphQL API for market data
  - Direct interaction with Morpho Blue smart contracts for transactions
  - Vault whitelist management and metadata enrichment

### Non-Custodial Architecture

Our MCP implementation is fully non-custodial, meaning:

1. **Transaction Signing**: MCP never requests or handles private keys. All transactions are returned unsigned to your application for signing by the end user.

2. **Transaction Flow**:
   - MCP constructs the transaction data (including to, data, value fields)
   - Your application receives this data and presents it to the user
   - The user signs the transaction with their own wallet
   - The signed transaction is broadcast to the blockchain

3. **Approval Handling**: For token approvals (required before most DeFi actions), MCP returns separate approval transactions when needed, clearly marked for user consent.

4. **No Backend Wallets**: Unlike centralized services, our implementation never uses backend wallets that could potentially access user funds.

### Security Measures

We've implemented several security measures to ensure safe interactions:

1. **Transaction Simulation**: Before returning transaction data, operations are simulated to detect potential failures or unexpected behavior.

2. **Parameter Validation**: All input parameters are strictly validated to prevent injection attacks or malformed transactions.

3. **Asset Verification**: Token addresses are verified against trusted sources to prevent interactions with potentially malicious contracts.

4. **Health Factor Warnings**: For lending operations, clear warnings are provided if actions would result in dangerous health factors.

5. **Rate Limiting**: API endpoints implement rate limiting to prevent abuse.

6. **No Hidden Operations**: All transaction data is transparent and can be decoded/verified before signing.

### Current Limitations

While our implementation is comprehensive, users should be aware of these limitations:

1. **Partial Protocol Coverage**: Not all features of each protocol are exposed (e.g., fixed-rate borrowing on Aave is not yet supported).

2. **Chain Limitations**: Some operations are chain-specific due to protocol deployment differences.

3. **Gas Estimation**: Gas estimations are provided but may need adjustment depending on network conditions.

4. **Advanced Features**: Complex operations like flash loans or automated leverage strategies are not currently exposed through the API.

### Implementation Best Practices

For secure integration with our MCP:

1. **Always Decode Transactions**: Decode and display transaction details to users before requesting signatures.

2. **Implement Timeouts**: Set reasonable timeouts for API calls to handle potential delays.

3. **Verify Results**: After transactions are submitted, verify the results on-chain rather than assuming success.

4. **Handle Edge Cases**: Implement proper error handling for scenarios like insufficient funds, slippage, or failed transactions.

5. **Simulate First**: Use simulation endpoints when available to preview transaction outcomes before signing. 